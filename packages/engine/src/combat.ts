// RF-11: Motor de combate — funciones puras (estado, acción) => nuevo estado.
// El cliente y el servidor ejecutan exactamente este código: el servidor re-simula
// seed + acciones con `replayCombat` y nunca confía en el estado del cliente.

import { SeededRng } from './rng.js';
import type {
  Ability,
  DiceTable,
  Die,
  DieKind,
  DieSource,
  Face,
  GameSymbol,
  Monster,
  Slot,
} from './types.js';

export type Outcome = 'defeat' | 'study' | 'flee' | 'ko';

export interface CombatSetup {
  readonly dice: readonly DieKind[];
  readonly hp: number;
  readonly maxHp: number;
  /** RF-13: Trofeos del inventario que se pueden colocar como si fueran dados. */
  readonly trophies?: readonly GameSymbol[];
  /** RF-14: Habilidades listas para usar en este combate (objetos cargados y destrezas). */
  readonly abilities?: readonly Ability[];
}

export type CombatAction =
  | { readonly type: 'reroll'; readonly dieIds: readonly string[] }
  | { readonly type: 'assign'; readonly dieId: string; readonly slot: number }
  | { readonly type: 'unassign'; readonly slot: number }
  | { readonly type: 'trophy'; readonly index: number; readonly slot: number }
  | {
      readonly type: 'ability';
      readonly abilityId: string;
      readonly dieIds: readonly string[];
      /** Trofeos del inventario (índices) que se usan como símbolos para activarla. */
      readonly trophies?: readonly number[];
      /** Solo para habilidades de "tres iguales": el trofeo que se gana (cualquiera). */
      readonly trophy?: GameSymbol;
    }
  /** Hasta resolver nada es definitivo: deshace una habilidad usada en este monstruo. */
  | { readonly type: 'undo'; readonly abilityId: string }
  /** Un corazón de la reserva cubre el daño pendiente de un dado blanco (D-08). */
  | { readonly type: 'block'; readonly dieId: string; readonly damageId: string }
  | { readonly type: 'unblock'; readonly damageId: string }
  | { readonly type: 'resolve'; readonly trophy?: GameSymbol };

export type CombatEvent =
  | {
      readonly type: 'roll';
      readonly dieIds: readonly string[];
      readonly addedWhite: string | null;
    }
  | {
      readonly type: 'damage';
      readonly dieId: string;
      readonly blockedBy: string | null;
      readonly coveredSlot: number | null;
    }
  | { readonly type: 'assign'; readonly dieId: string; readonly slot: number }
  | { readonly type: 'unassign'; readonly dieId: string; readonly slot: number }
  | {
      readonly type: 'trophy';
      readonly dieId: string;
      readonly symbol: GameSymbol;
      readonly slot: number;
    }
  | {
      readonly type: 'ability';
      readonly abilityId: string;
      readonly dieIds: readonly string[];
      readonly created: readonly string[];
    }
  | { readonly type: 'undo'; readonly abilityId: string }
  | {
      readonly type: 'resolve';
      readonly outcome: Outcome;
      readonly trophy: GameSymbol | null;
      /** HPie perdido por los espacios de daño del monstruo que no cubrió un corazón. */
      readonly damage?: number;
    };

/** Corazón elegido para cubrir el daño de un dado blanco. */
export interface Block {
  readonly damage: string;
  readonly heart: string;
}

export interface CombatState {
  readonly monster: Monster;
  readonly hp: number;
  readonly maxHp: number;
  readonly dice: readonly Die[];
  /** Id del dado asignado a cada uno de los 4 slots, o null. */
  readonly assignments: readonly (string | null)[];
  /** Dados fuera de juego: corazones usados como escudo, dados de daño que ya hirieron
   * y símbolos consumidos por una habilidad. */
  readonly spent: readonly string[];
  /** Corazones puestos sobre daño pendiente; se gastan al relanzar o resolver. */
  readonly blocks: readonly Block[];
  /** Trofeos del inventario que aún no se colocaron en el monstruo. */
  readonly trophies: readonly GameSymbol[];
  /** Habilidades disponibles en este combate. */
  readonly abilities: readonly Ability[];
  /** Ids de las habilidades ya usadas en este monstruo (cada una, una vez por monstruo). */
  readonly usedAbilities: readonly string[];
  /** Contador para ids de dados nuevos (blancos, trofeos, símbolos de habilidad). */
  readonly serial: number;
  /** Estado del RNG (uint32) para continuar la secuencia determinista. */
  readonly rngState: number;
  readonly rerolls: number;
  readonly status: 'active' | 'resolved';
  readonly outcome: Outcome | null;
  /** true si el HPie llegó a 0 (aunque el monstruo haya sido derrotado en la misma tirada). */
  readonly ko: boolean;
  readonly trophy: GameSymbol | null;
  readonly log: readonly CombatEvent[];
}

/** Acción inválida para el estado actual (entrada no confiable, dado inexistente, etc.). */
export class CombatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CombatError';
  }
}

const SYMBOLS: readonly Face[] = ['Horn', 'Wing', 'Claw', 'Tail'];

function isSymbol(face: Face): face is GameSymbol {
  return SYMBOLS.includes(face);
}

/** Solo los dados físicos se relanzan; trofeos y símbolos de habilidad no. */
export function isRollable(kind: DieSource): kind is DieKind {
  return kind !== 'trophy' && kind !== 'token';
}

/**
 * RF-11.1: ¿Puede esta cara cubrir este slot?
 * - Un símbolo cubre su mismo slot o un slot 'all'.
 * - El comodín cubre cualquier slot de símbolo, nunca un slot 'damage' (RNF-04).
 * - Un slot 'damage' solo lo cubre un corazón del dado rojo, que anula ese daño (D-07).
 */
export function faceMatchesSlot(face: Face, slot: Slot): boolean {
  if (slot === 'damage') return face === 'heart';
  if (face === 'wild') return true;
  if (slot === 'all') return isSymbol(face);
  return face === slot;
}

function rollFace(kind: DieKind, rng: SeededRng, table: DiceTable): Face {
  const faces = table[kind];
  return faces[rng.nextInt(0, faces.length - 1)] as Face;
}

function getDie(state: CombatState, dieId: string): Die {
  const die = state.dice.find((d) => d.id === dieId);
  if (!die) throw new CombatError(`El dado "${dieId}" no existe`);
  return die;
}

/**
 * Dados en la reserva: ni asignados a un slot, ni gastados, ni cubriendo daño. El daño
 * pendiente de los blancos no está en la reserva: se ve aparte (`pendingHits`).
 */
export function availableDice(state: CombatState): Die[] {
  return state.dice.filter(
    (d) =>
      d.face !== 'damage' &&
      !state.assignments.includes(d.id) &&
      !state.spent.includes(d.id) &&
      !state.blocks.some((b) => b.heart === d.id),
  );
}

/**
 * D-08: Daño de los dados blancos que aún no se paga. Se recibe al relanzar o al resolver;
 * mientras tanto el jugador decide si lo cubre con un corazón o usa ese dado para otra cosa.
 */
export function pendingHits(
  state: CombatState,
): { readonly die: Die; readonly heart: string | null }[] {
  return state.dice
    .filter((d) => d.face === 'damage' && !state.spent.includes(d.id))
    .map((die) => ({ die, heart: state.blocks.find((b) => b.damage === die.id)?.heart ?? null }));
}

export function coveredSlots(state: CombatState): number {
  return state.assignments.filter((a) => a !== null).length;
}

/**
 * Espacios de daño del monstruo sin corazón: al resolver cuentan como cubiertos, pero cada
 * uno cuesta 1 HPie (manual p. 11: "puedes elegir gastar un HPie o el dado").
 */
export function pendingDamage(state: CombatState): number {
  return state.monster.slots.filter((s, i) => s === 'damage' && state.assignments[i] === null)
    .length;
}

/**
 * RF-11.5: Resultado que daría resolver ahora mismo (null si aún no hay símbolos).
 * Los espacios de daño libres cuentan como cubiertos (D-07), pero hace falta al menos un
 * dado o trofeo colocado para resolver.
 */
export function previewOutcome(state: CombatState): Exclude<Outcome, 'ko'> | null {
  if (coveredSlots(state) === 0) return null;
  const covered = coveredSlots(state) + pendingDamage(state);
  if (covered >= 4) return 'defeat';
  if (covered >= 2) return 'study';
  return 'flee';
}

/** Slots libres que esta cara podría cubrir — la UI lo usa para resaltar, sin calcular reglas. */
export function slotsForFace(state: CombatState, face: Face): number[] {
  if (state.status !== 'active') return [];
  return state.monster.slots
    .map((slot, i) => (state.assignments[i] === null && faceMatchesSlot(face, slot) ? i : -1))
    .filter((i) => i >= 0);
}

/** Slots libres que este dado podría cubrir. */
export function validSlotsFor(state: CombatState, dieId: string): number[] {
  const die = availableDice(state).find((d) => d.id === dieId);
  return die ? slotsForFace(state, die.face) : [];
}

/** Cuántos símbolos consume cada tipo de habilidad activable. */
export const ABILITY_INPUTS = { triple: 3, double: 1, wild: 1, convert: 2 } as const;

/** ¿Esta cara sirve para activar la habilidad? El comodín cuenta como cualquier símbolo. */
export function faceActivates(face: Face, ability: Ability): boolean {
  if (ability.effect.type === 'special') return false;
  return face === ability.effect.symbol || face === 'wild';
}

/** HPie con el que se puede pelear: entero, al menos 1 y sin pasar del máximo. */
export function isValidHp(hp: number, maxHp: number): boolean {
  return Number.isInteger(hp) && hp >= 1 && hp <= maxHp;
}

/**
 * RF-11.3, RF-11.4 (D-08): Paga el daño pendiente de los dados blancos. Pasa al relanzar o al
 * resolver, nunca al lanzar: hasta entonces el jugador decide. Cada corazón roto hace daño
 * directo (no cubre el espacio de daño del monstruo, D-07); si tiene un corazón encima, ese
 * corazón se gasta y no se pierde HPie; si no, se pierde 1 HPie. El dado de daño se gasta.
 */
function takeWhiteDamage(state: CombatState): CombatState {
  const hits = pendingHits(state);
  if (hits.length === 0) return state;
  const unblocked = hits.filter((h) => h.heart === null).length;
  return {
    ...state,
    hp: Math.max(0, state.hp - unblocked),
    spent: [...state.spent, ...hits.flatMap((h) => (h.heart ? [h.die.id, h.heart] : [h.die.id]))],
    blocks: [],
    log: [
      ...state.log,
      ...hits.map((h): CombatEvent => ({
        type: 'damage',
        dieId: h.die.id,
        blockedBy: h.heart,
        coveredSlot: null,
      })),
    ],
  };
}

/** RF-11.6: KO al relanzar. Si el monstruo ya quedaba derrotado, se conservan los beneficios. */
function knockOut(state: CombatState): CombatState {
  const defeated = previewOutcome(state) === 'defeat';
  const trophy = defeated ? (state.monster.trophies[0] ?? null) : null;
  const outcome: Outcome = defeated ? 'defeat' : 'ko';
  return {
    ...state,
    hp: 0,
    ko: true,
    status: 'resolved',
    outcome,
    trophy,
    log: [...state.log, { type: 'resolve', outcome, trophy }],
  };
}

/** Pone un corazón de la reserva sobre el daño pendiente de un dado blanco. */
function block(state: CombatState, heartId: string, damageId: string): CombatState {
  const heart = availableDice(state).find((d) => d.id === heartId);
  if (!heart || heart.face !== 'heart') {
    throw new CombatError('Elige un corazón de tu reserva para cubrir el daño');
  }
  const hit = pendingHits(state).find((h) => h.die.id === damageId);
  if (!hit) throw new CombatError('No hay daño pendiente en ese dado');
  if (hit.heart) throw new CombatError('Ese daño ya está cubierto');
  return { ...state, blocks: [...state.blocks, { damage: damageId, heart: heartId }] };
}

function unblock(state: CombatState, damageId: string): CombatState {
  if (!state.blocks.some((b) => b.damage === damageId)) {
    throw new CombatError('Ese daño no tiene corazón');
  }
  return { ...state, blocks: state.blocks.filter((b) => b.damage !== damageId) };
}

/** RF-11.2: Inicia un combate lanzando todos los dados de la reserva. */
export function startCombat(
  monster: Monster,
  setup: CombatSetup,
  seed: number | string,
  table: DiceTable,
): CombatState {
  if (setup.dice.length === 0) throw new CombatError('La reserva de dados está vacía');
  if (!isValidHp(setup.hp, setup.maxHp)) {
    throw new CombatError(`HPie inválido: ${setup.hp}`);
  }
  const rng = new SeededRng(seed);
  const dice = setup.dice.map((kind, i) => ({
    id: `d${i}`,
    kind,
    face: rollFace(kind, rng, table),
  }));
  const ids = dice.map((d) => d.id);
  return {
    monster,
    hp: setup.hp,
    maxHp: setup.maxHp,
    dice,
    assignments: [null, null, null, null],
    spent: [],
    blocks: [],
    trophies: [...(setup.trophies ?? [])],
    // Las destrezas de dado especial son pasivas: no se activan en combate
    abilities: (setup.abilities ?? []).filter((a) => a.effect.type !== 'special'),
    usedAbilities: [],
    serial: dice.length,
    rngState: rng.currentState,
    rerolls: 0,
    status: 'active',
    outcome: null,
    ko: false,
    trophy: null,
    log: [{ type: 'roll', dieIds: ids, addedWhite: null }],
  };
}

/** ¿Queda algún dado físico en la reserva que se pueda relanzar? */
export function canRerollAny(state: CombatState): boolean {
  return availableDice(state).some((d) => isRollable(d.kind));
}

/**
 * RF-11.3: Relanza los dados elegidos; cada relanzamiento añade un dado de daño blanco.
 * Antes de lanzar se paga el daño pendiente (D-08). Sin dados que relanzar (todos gastados
 * o asignados) se puede "empujar la suerte" solo con el dado blanco, para que el combate
 * nunca quede trabado (D-19).
 */
function reroll(state: CombatState, dieIds: readonly string[], table: DiceTable): CombatState {
  if (dieIds.length === 0 && canRerollAny(state)) {
    throw new CombatError('Selecciona al menos un dado para relanzar');
  }
  if (new Set(dieIds).size !== dieIds.length)
    throw new CombatError('Dados repetidos en el relanzamiento');
  const available = new Set(availableDice(state).map((d) => d.id));
  for (const id of dieIds) {
    const die = getDie(state, id);
    if (!available.has(id)) throw new CombatError(`El dado "${id}" no está en la reserva`);
    if (!isRollable(die.kind)) throw new CombatError('Los trofeos y símbolos no se relanzan');
  }

  // Relanzar es una decisión: primero se recibe el daño pendiente
  const paid = takeWhiteDamage(state);
  if (paid.hp <= 0) return knockOut(paid);

  const rng = new SeededRng(paid.rngState);
  const selected = new Set(dieIds);
  // Orden determinista: el de la reserva, no el del input
  const rerolled = paid.dice.map((d) =>
    selected.has(d.id) && isRollable(d.kind) ? { ...d, face: rollFace(d.kind, rng, table) } : d,
  );
  const white: Die = {
    id: `d${paid.serial}`,
    kind: 'white',
    face: rollFace('white', rng, table),
  };
  const rolledIds = [...paid.dice.filter((d) => selected.has(d.id)).map((d) => d.id), white.id];

  return {
    ...paid,
    dice: [...rerolled, white],
    serial: paid.serial + 1,
    rngState: rng.currentState,
    rerolls: paid.rerolls + 1,
    log: [...paid.log, { type: 'roll', dieIds: rolledIds, addedWhite: white.id }],
  };
}

function checkSlot(state: CombatState, slot: number): Slot {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3)
    throw new CombatError(`Slot inválido: ${slot}`);
  if (state.assignments[slot] !== null) throw new CombatError(`El slot ${slot} ya está cubierto`);
  return state.monster.slots[slot] as Slot;
}

function assign(state: CombatState, dieId: string, slot: number): CombatState {
  const slotType = checkSlot(state, slot);
  const die = getDie(state, dieId);
  if (!availableDice(state).some((d) => d.id === dieId)) {
    throw new CombatError(`El dado "${dieId}" no está en la reserva`);
  }
  if (!faceMatchesSlot(die.face, slotType)) {
    throw new CombatError(`La cara "${die.face}" no cubre el slot "${slotType}"`);
  }
  const assignments = [...state.assignments];
  assignments[slot] = dieId;
  return { ...state, assignments, log: [...state.log, { type: 'assign', dieId, slot }] };
}

/** RF-13: Coloca un trofeo del inventario en el monstruo, como si fuera un dado. */
function placeTrophy(state: CombatState, index: number, slot: number): CombatState {
  const slotType = checkSlot(state, slot);
  const symbol = Number.isInteger(index) ? state.trophies[index] : undefined;
  if (symbol === undefined) throw new CombatError(`No tienes el trofeo ${index}`);
  if (!faceMatchesSlot(symbol, slotType)) {
    throw new CombatError(`El trofeo "${symbol}" no cubre el slot "${slotType}"`);
  }
  const dieId = `d${state.serial}`;
  const assignments = [...state.assignments];
  assignments[slot] = dieId;
  return {
    ...state,
    dice: [...state.dice, { id: dieId, kind: 'trophy', face: symbol }],
    assignments,
    trophies: state.trophies.filter((_, i) => i !== index),
    serial: state.serial + 1,
    log: [...state.log, { type: 'trophy', dieId, symbol, slot }],
  };
}

function unassign(state: CombatState, slot: number): CombatState {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3)
    throw new CombatError(`Slot inválido: ${slot}`);
  const dieId = state.assignments[slot];
  if (dieId === null || dieId === undefined) throw new CombatError(`El slot ${slot} está vacío`);
  const assignments = [...state.assignments];
  assignments[slot] = null;
  const die = getDie(state, dieId);
  // Un trofeo retirado vuelve al inventario: solo se gasta si se usa al resolver
  const returned = die.kind === 'trophy' && isSymbol(die.face) ? die.face : null;
  return {
    ...state,
    assignments,
    dice: returned ? state.dice.filter((d) => d.id !== dieId) : state.dice,
    trophies: returned ? [...state.trophies, returned] : state.trophies,
    log: [...state.log, { type: 'unassign', dieId, slot }],
  };
}

/**
 * RF-14: Activa una habilidad consumiendo símbolos de la reserva o trofeos del inventario
 * (el comodín cuenta como cualquier símbolo). Los símbolos consumidos quedan gastados y los
 * creados aparecen como dados nuevos que no se pueden relanzar. "Tres iguales" derrota al
 * monstruo de inmediato, ignorando sus espacios (incluido el de daño), y el trofeo puede
 * ser cualquiera.
 */
function useAbility(
  state: CombatState,
  abilityId: string,
  dieIds: readonly string[],
  trophyIndexes: readonly number[],
  trophy: GameSymbol | undefined,
): CombatState {
  const ability = state.abilities.find((a) => a.id === abilityId);
  if (!ability) throw new CombatError(`No tienes la habilidad "${abilityId}"`);
  const { effect } = ability;
  if (effect.type === 'special') throw new CombatError(`${ability.name} es pasiva`);
  if (state.usedAbilities.includes(abilityId)) {
    throw new CombatError(`Ya usaste ${ability.name} con este monstruo`);
  }
  const need = ABILITY_INPUTS[effect.type];
  const inputs = dieIds.length + trophyIndexes.length;
  if (
    inputs !== need ||
    new Set(dieIds).size !== dieIds.length ||
    new Set(trophyIndexes).size !== trophyIndexes.length
  ) {
    throw new CombatError(`${ability.name} necesita ${need} símbolo(s) ${effect.symbol}`);
  }
  const available = new Set(availableDice(state).map((d) => d.id));
  for (const id of dieIds) {
    const die = getDie(state, id);
    if (!available.has(id)) throw new CombatError(`El dado "${id}" no está en la reserva`);
    if (!faceActivates(die.face, ability)) {
      throw new CombatError(`La cara "${die.face}" no activa ${ability.name}`);
    }
  }
  for (const index of trophyIndexes) {
    const symbol = Number.isInteger(index) ? state.trophies[index] : undefined;
    if (symbol === undefined) throw new CombatError(`No tienes el trofeo ${index}`);
    if (!faceActivates(symbol, ability)) {
      throw new CombatError(`El trofeo "${symbol}" no activa ${ability.name}`);
    }
  }
  if (effect.type === 'triple' && (trophy === undefined || !isSymbol(trophy))) {
    throw new CombatError('Elige un trofeo');
  }

  // Los trofeos usados pasan a ser dados gastados; deshacer la habilidad los devuelve
  const paid: Die[] = trophyIndexes.map((index, i) => ({
    id: `d${state.serial + i}`,
    kind: 'trophy',
    face: state.trophies[index] as GameSymbol,
  }));
  const serial = state.serial + paid.length;
  const consumed = [...dieIds, ...paid.map((d) => d.id)];

  const faces: Face[] =
    effect.type === 'double'
      ? [effect.symbol, effect.symbol]
      : effect.type === 'wild'
        ? ['wild']
        : effect.type === 'convert'
          ? ['wild', 'wild', 'wild']
          : [];
  const created = faces.map((face, i) => ({
    id: `d${serial + i}`,
    kind: 'token' as const,
    face,
  }));
  const next: CombatState = {
    ...state,
    dice: [...state.dice, ...paid, ...created],
    spent: [...state.spent, ...consumed],
    trophies: state.trophies.filter((_, i) => !trophyIndexes.includes(i)),
    usedAbilities: [...state.usedAbilities, abilityId],
    serial: serial + created.length,
    log: [
      ...state.log,
      { type: 'ability', abilityId, dieIds: consumed, created: created.map((d) => d.id) },
    ],
  };
  if (effect.type !== 'triple') return next;
  const won = trophy as GameSymbol;
  return {
    ...next,
    status: 'resolved',
    outcome: 'defeat',
    trophy: won,
    log: [...next.log, { type: 'resolve', outcome: 'defeat', trophy: won }],
  };
}

/**
 * Hasta resolver nada es definitivo (manual p. 11): deshace una habilidad. Los símbolos
 * que creó desaparecen (si estaban en el monstruo, se retiran) y los dados y trofeos que
 * consumió vuelven a la reserva y al inventario.
 */
function undoAbility(state: CombatState, abilityId: string): CombatState {
  if (!state.usedAbilities.includes(abilityId)) {
    throw new CombatError(`No has usado "${abilityId}" con este monstruo`);
  }
  const entry = [...state.log]
    .reverse()
    .find((e) => e.type === 'ability' && e.abilityId === abilityId);
  if (entry?.type !== 'ability') throw new CombatError(`No has usado "${abilityId}"`);
  if (entry.created.some((id) => state.spent.includes(id))) {
    throw new CombatError('Sus símbolos activaron otra habilidad: deshaz esa primero');
  }
  const created = new Set(entry.created);
  const consumed = new Set(entry.dieIds);
  const returned = state.dice.filter((d) => consumed.has(d.id) && d.kind === 'trophy');
  const removed = new Set([...created, ...returned.map((d) => d.id)]);
  return {
    ...state,
    dice: state.dice.filter((d) => !removed.has(d.id)),
    assignments: state.assignments.map((id) => (id !== null && created.has(id) ? null : id)),
    spent: state.spent.filter((id) => !consumed.has(id)),
    trophies: [...state.trophies, ...returned.map((d) => d.face as GameSymbol)],
    usedAbilities: state.usedAbilities.filter((id) => id !== abilityId),
    log: [...state.log, { type: 'undo', abilityId }],
  };
}

/**
 * RF-11.5: Derrotar (4 espacios), Estudiar (2–3) o Huir (1). Al resolver se paga el daño
 * pendiente de los dados blancos (D-08) y cada espacio de daño del monstruo sin corazón
 * (D-07), 1 HPie cada uno; si eso deja KO, solo derrotar conserva los beneficios.
 */
function resolve(state: CombatState, trophy: GameSymbol | undefined): CombatState {
  const outcome = previewOutcome(state);
  if (outcome === null) throw new CombatError('Necesitas al menos un símbolo para resolver');
  let chosen: GameSymbol | null = null;
  if (outcome !== 'flee') {
    if (trophy === undefined) throw new CombatError('Elige un trofeo');
    if (!state.monster.trophies.includes(trophy)) {
      throw new CombatError(`"${trophy}" no es un trofeo de ${state.monster.name}`);
    }
    chosen = trophy;
  }
  const paid = takeWhiteDamage(state);
  const damage = pendingDamage(state);
  const hp = Math.max(0, paid.hp - damage);
  const ko = hp === 0;
  const final: Outcome = ko && outcome !== 'defeat' ? 'ko' : outcome;
  const won = final === 'ko' ? null : chosen;
  return {
    ...paid,
    hp,
    ko,
    status: 'resolved',
    outcome: final,
    trophy: won,
    log: [
      ...paid.log,
      { type: 'resolve', outcome: final, trophy: won, ...(damage > 0 ? { damage } : {}) },
    ],
  };
}

/** Aplica una acción. Lanza CombatError si la acción no es válida en el estado actual. */
export function applyAction(
  state: CombatState,
  action: CombatAction,
  table: DiceTable,
): CombatState {
  if (state.status !== 'active') throw new CombatError('El combate ya terminó');
  switch (action.type) {
    case 'reroll':
      return reroll(state, action.dieIds, table);
    case 'assign':
      return assign(state, action.dieId, action.slot);
    case 'unassign':
      return unassign(state, action.slot);
    case 'trophy':
      return placeTrophy(state, action.index, action.slot);
    case 'ability':
      return useAbility(
        state,
        action.abilityId,
        action.dieIds,
        action.trophies ?? [],
        action.trophy,
      );
    case 'undo':
      return undoAbility(state, action.abilityId);
    case 'block':
      return block(state, action.dieId, action.damageId);
    case 'unblock':
      return unblock(state, action.damageId);
    case 'resolve':
      return resolve(state, action.trophy);
    default:
      throw new CombatError('Acción desconocida');
  }
}

/**
 * Regla de oro 2: el servidor re-simula seed + acciones con el mismo engine.
 * Devuelve el estado final; lanza CombatError ante cualquier acción ilegal.
 */
export function replayCombat(
  monster: Monster,
  setup: CombatSetup,
  seed: number | string,
  actions: readonly CombatAction[],
  table: DiceTable,
): CombatState {
  return actions.reduce(
    (s, a) => applyAction(s, a, table),
    startCombat(monster, setup, seed, table),
  );
}

/** Estructura de run: ofrece dos encuentros de distinto tipo de símbolo. */
export function pickEncounterPair(
  monsters: readonly Monster[],
  seed: number | string,
): [Monster, Monster] {
  const rng = new SeededRng(seed);
  const first = monsters[rng.nextInt(0, monsters.length - 1)];
  const others = monsters.filter((m) => first !== undefined && m.type !== first.type);
  if (!first || others.length === 0) {
    throw new CombatError('Se necesitan monstruos de al menos dos tipos distintos');
  }
  return [first, others[rng.nextInt(0, others.length - 1)] as Monster];
}
