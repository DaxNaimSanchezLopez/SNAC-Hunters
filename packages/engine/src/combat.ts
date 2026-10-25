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
      /** Solo para habilidades de "tres iguales": el trofeo que se gana (cualquiera). */
      readonly trophy?: GameSymbol;
    }
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
  | { readonly type: 'resolve'; readonly outcome: Outcome; readonly trophy: GameSymbol | null };

export interface CombatState {
  readonly monster: Monster;
  readonly hp: number;
  readonly maxHp: number;
  readonly dice: readonly Die[];
  /** Id del dado asignado a cada espacio del monstruo (4, o 6 el jefe), o null. */
  readonly assignments: readonly (string | null)[];
  /** Dados fuera de juego: corazones usados como escudo, dados de daño que ya hirieron
   * y símbolos consumidos por una habilidad. */
  readonly spent: readonly string[];
  /** Trofeos del inventario que aún no se colocaron en el monstruo. */
  readonly trophies: readonly GameSymbol[];
  /** Habilidades disponibles en este combate. */
  readonly abilities: readonly Ability[];
  /** Ids de las habilidades ya usadas en este monstruo (cada una, una vez por monstruo). */
  readonly usedAbilities: readonly string[];
  /** Contador para ids de dados nuevos (blancos, trofeos, símbolos de habilidad). */
  readonly serial: number;
  /** Daños que bloquea cada corazón: 1, o 2 con Double Healing. */
  readonly heartBlocks: number;
  /** Corazones que ya bloquearon un daño y aún pueden bloquear otro (Double Healing). */
  readonly cracked: readonly string[];
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
 * - El comodín cubre cualquier slot de símbolo, nunca un corazón ni un slot 'damage' (RNF-04).
 * - Los slots 'damage' solo se cubren recibiendo daño (D-07), no asignando a mano.
 */
export function faceMatchesSlot(face: Face, slot: Slot): boolean {
  if (slot === 'damage') return false;
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

/** Dados en la reserva: ni asignados a un slot ni gastados. */
export function availableDice(state: CombatState): Die[] {
  return state.dice.filter((d) => !state.assignments.includes(d.id) && !state.spent.includes(d.id));
}

export function coveredSlots(state: CombatState): number {
  return state.assignments.filter((a) => a !== null).length;
}

/**
 * RF-11.5: Resultado que daría resolver ahora mismo (null si aún no hay símbolos).
 * RF-16: al jefe solo se le derrota cubriendo todos sus espacios; con menos, se huye.
 */
export function previewOutcome(state: CombatState): Exclude<Outcome, 'ko'> | null {
  const covered = coveredSlots(state);
  if (covered >= state.monster.slots.length) return 'defeat';
  if (covered >= 2 && !state.monster.boss) return 'study';
  if (covered >= 1) return 'flee';
  return null;
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

/** Cuántos dados consume cada tipo de habilidad que se activa en combate. */
export const ABILITY_INPUTS = {
  triple: 3,
  double: 1,
  wild: 1,
  convert: 2,
  lucky: 1,
  gauntlet: 0,
} as const;

export type ActiveEffect = Extract<Ability['effect'], { type: keyof typeof ABILITY_INPUTS }>;

/** ¿Se activa en combate? Las demás son pasivas o se usan fuera de combate. */
export function isActive(ability: Ability): ability is Ability & { effect: ActiveEffect } {
  return ability.effect.type in ABILITY_INPUTS;
}

/**
 * ¿Este dado sirve para activar la habilidad? El comodín cuenta como cualquier símbolo;
 * las cartas Lucky piden un comodín lanzado en el dado especial de su color.
 */
export function dieActivates(die: Die, ability: Ability): boolean {
  const { effect } = ability;
  if (effect.type === 'lucky') return die.kind === effect.die && die.face === 'wild';
  if (!('symbol' in effect)) return false;
  return die.face === effect.symbol || die.face === 'wild';
}

/**
 * RF-11.3, RF-11.4: Resuelve las caras de daño recién lanzadas.
 * Cada corazón roto:
 *  1. Si el monstruo tiene un slot 'damage' libre, el dado lo cubre (D-07).
 *  2. Un corazón disponible en la reserva lo bloquea (escudo); si no hay, se pierde 1 HPie.
 * Los corazones lanzados en la misma tirada también cuentan como escudo (daño y escudo simultáneos).
 */
function applyDamage(state: CombatState, rolledIds: readonly string[]): CombatState {
  let next = state;
  for (const id of rolledIds) {
    const die = getDie(next, id);
    if (die.face !== 'damage') continue;

    const slotIdx = next.monster.slots.findIndex(
      (s, i) => s === 'damage' && next.assignments[i] === null,
    );
    const assignments = [...next.assignments];
    const spent = [...next.spent];
    if (slotIdx >= 0) assignments[slotIdx] = id;
    else spent.push(id);

    // Con Double Healing, primero se termina de gastar un corazón que ya bloqueó una vez
    const hearts = next.dice.filter(
      (d) => d.face === 'heart' && !assignments.includes(d.id) && !spent.includes(d.id),
    );
    const shield = hearts.find((d) => next.cracked.includes(d.id)) ?? hearts[0];
    let cracked = next.cracked;
    if (shield && next.heartBlocks > 1 && !cracked.includes(shield.id)) {
      cracked = [...cracked, shield.id];
    } else if (shield) {
      spent.push(shield.id);
      cracked = cracked.filter((id) => id !== shield.id);
    }
    const hp = shield ? next.hp : next.hp - 1;

    next = {
      ...next,
      hp,
      assignments,
      spent,
      cracked,
      log: [
        ...next.log,
        {
          type: 'damage',
          dieId: id,
          blockedBy: shield ? shield.id : null,
          coveredSlot: slotIdx >= 0 ? slotIdx : null,
        },
      ],
    };

    if (hp <= 0) return knockOut(next);
  }
  return next;
}

/** RF-11.6: KO. Si en ese momento el monstruo queda derrotado, se conservan los beneficios. */
function knockOut(state: CombatState): CombatState {
  const defeated = coveredSlots(state) === state.monster.slots.length;
  const trophy = defeated && !state.monster.boss ? (state.monster.trophies[0] ?? null) : null;
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

/** RF-11.2: Inicia un combate lanzando todos los dados de la reserva. */
export function startCombat(
  monster: Monster,
  setup: CombatSetup,
  seed: number | string,
  table: DiceTable,
): CombatState {
  if (setup.dice.length === 0) throw new CombatError('La reserva de dados está vacía');
  if (!Number.isInteger(setup.hp) || setup.hp < 1 || setup.hp > setup.maxHp) {
    throw new CombatError(`HPie inválido: ${setup.hp}`);
  }
  const rng = new SeededRng(seed);
  const dice = setup.dice.map((kind, i) => ({
    id: `d${i}`,
    kind,
    face: rollFace(kind, rng, table),
  }));
  const ids = dice.map((d) => d.id);
  const state: CombatState = {
    monster,
    hp: setup.hp,
    maxHp: setup.maxHp,
    dice,
    assignments: monster.slots.map(() => null),
    spent: [],
    trophies: [...(setup.trophies ?? [])],
    // Las cartas pasivas o de fuera de combate no aparecen como activables
    abilities: (setup.abilities ?? []).filter(isActive),
    usedAbilities: [],
    serial: dice.length,
    heartBlocks: (setup.abilities ?? []).some((a) => a.effect.type === 'shield') ? 2 : 1,
    cracked: [],
    rngState: rng.currentState,
    rerolls: 0,
    status: 'active',
    outcome: null,
    ko: false,
    trophy: null,
    log: [{ type: 'roll', dieIds: ids, addedWhite: null }],
  };
  return applyDamage(state, ids);
}

/** ¿Queda algún dado físico en la reserva que se pueda relanzar? */
export function canRerollAny(state: CombatState): boolean {
  return availableDice(state).some((d) => isRollable(d.kind));
}

/**
 * RF-11.3: Relanza los dados elegidos; cada relanzamiento añade un dado de daño blanco.
 * Sin dados que relanzar (todos gastados o asignados) se puede "empujar la suerte" solo con
 * el dado blanco, para que el combate nunca quede trabado (D-19).
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

  const rng = new SeededRng(state.rngState);
  const selected = new Set(dieIds);
  // Orden determinista: el de la reserva, no el del input
  const rerolled = state.dice.map((d) =>
    selected.has(d.id) && isRollable(d.kind) ? { ...d, face: rollFace(d.kind, rng, table) } : d,
  );
  const white: Die = {
    id: `d${state.serial}`,
    kind: 'white',
    face: rollFace('white', rng, table),
  };
  const rolledIds = [...state.dice.filter((d) => selected.has(d.id)).map((d) => d.id), white.id];

  const next: CombatState = {
    ...state,
    dice: [...rerolled, white],
    serial: state.serial + 1,
    rngState: rng.currentState,
    rerolls: state.rerolls + 1,
    log: [...state.log, { type: 'roll', dieIds: rolledIds, addedWhite: white.id }],
  };
  return applyDamage(next, rolledIds);
}

function validSlotIndex(state: CombatState, slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < state.monster.slots.length;
}

function checkSlot(state: CombatState, slot: number): Slot {
  if (!validSlotIndex(state, slot)) throw new CombatError(`Slot inválido: ${slot}`);
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
  if (!validSlotIndex(state, slot)) throw new CombatError(`Slot inválido: ${slot}`);
  const dieId = state.assignments[slot];
  if (dieId === null || dieId === undefined) throw new CombatError(`El slot ${slot} está vacío`);
  if (state.monster.slots[slot] === 'damage') {
    throw new CombatError('El daño recibido no se puede deshacer');
  }
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
 * RF-14: Activa una habilidad consumiendo dados de la reserva (el comodín cuenta como
 * cualquier símbolo). Los consumidos quedan gastados y los símbolos creados aparecen como
 * dados nuevos que no se pueden relanzar. "Tres iguales" derrota al monstruo de inmediato,
 * ignorando sus espacios (incluido el de daño), y el trofeo puede ser cualquiera; no sirve
 * contra el jefe (D-30). Cursed Gauntlet no consume dados: cuesta 1 HPie.
 */
function useAbility(
  state: CombatState,
  abilityId: string,
  dieIds: readonly string[],
  trophy: GameSymbol | undefined,
): CombatState {
  const ability = state.abilities.find((a) => a.id === abilityId);
  if (!ability || !isActive(ability)) {
    throw new CombatError(`No tienes la habilidad "${abilityId}"`);
  }
  const { effect } = ability;
  if (state.usedAbilities.includes(abilityId)) {
    throw new CombatError(`Ya usaste ${ability.name} con este monstruo`);
  }
  if (effect.type === 'triple' && state.monster.boss) {
    throw new CombatError(`${ability.name} no sirve contra el jefe`);
  }
  const need = ABILITY_INPUTS[effect.type];
  if (dieIds.length !== need || new Set(dieIds).size !== need) {
    const what = 'symbol' in effect ? ` ${effect.symbol}` : '';
    throw new CombatError(`${ability.name} necesita ${need} símbolo(s)${what}`);
  }
  const available = new Set(availableDice(state).map((d) => d.id));
  for (const id of dieIds) {
    const die = getDie(state, id);
    if (!available.has(id)) throw new CombatError(`El dado "${id}" no está en la reserva`);
    if (!dieActivates(die, ability)) {
      throw new CombatError(`La cara "${die.face}" no activa ${ability.name}`);
    }
  }
  if (effect.type === 'triple' && (trophy === undefined || !isSymbol(trophy))) {
    throw new CombatError('Elige un trofeo');
  }

  const faces: Face[] =
    effect.type === 'double'
      ? [effect.symbol, effect.symbol]
      : effect.type === 'convert'
        ? ['wild', 'wild', 'wild']
        : effect.type === 'lucky'
          ? ['wild', 'wild']
          : effect.type === 'triple'
            ? []
            : ['wild'];
  const created = faces.map((face, i) => ({
    id: `d${state.serial + i}`,
    kind: 'token' as const,
    face,
  }));
  const next: CombatState = {
    ...state,
    hp: effect.type === 'gauntlet' ? state.hp - 1 : state.hp,
    dice: [...state.dice, ...created],
    spent: [...state.spent, ...dieIds],
    usedAbilities: [...state.usedAbilities, abilityId],
    serial: state.serial + created.length,
    log: [
      ...state.log,
      { type: 'ability', abilityId, dieIds: [...dieIds], created: created.map((d) => d.id) },
    ],
  };
  if (next.hp <= 0) return knockOut(next);
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

/** RF-11.5: Derrotar (todos los espacios), Estudiar (2–3) o Huir (1). El jefe no da trofeo. */
function resolve(state: CombatState, trophy: GameSymbol | undefined): CombatState {
  const outcome = previewOutcome(state);
  if (outcome === null) throw new CombatError('Necesitas al menos un símbolo para resolver');
  let chosen: GameSymbol | null = null;
  if (outcome !== 'flee' && !state.monster.boss) {
    if (trophy === undefined) throw new CombatError('Elige un trofeo');
    if (!state.monster.trophies.includes(trophy)) {
      throw new CombatError(`"${trophy}" no es un trofeo de ${state.monster.name}`);
    }
    chosen = trophy;
  }
  return {
    ...state,
    status: 'resolved',
    outcome,
    trophy: chosen,
    log: [...state.log, { type: 'resolve', outcome, trophy: chosen }],
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
      return useAbility(state, action.abilityId, action.dieIds, action.trophy);
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
