// RF-11: Motor de combate — funciones puras (estado, acción) => nuevo estado.
// El cliente y el servidor ejecutan exactamente este código: el servidor re-simula
// seed + acciones con `replayCombat` y nunca confía en el estado del cliente.

import { SeededRng } from './rng.js';
import type { DiceTable, Die, DieKind, Face, GameSymbol, Monster, Slot } from './types.js';

export type Outcome = 'defeat' | 'study' | 'flee' | 'ko';

export interface CombatSetup {
  readonly dice: readonly DieKind[];
  readonly hp: number;
  readonly maxHp: number;
}

export type CombatAction =
  | { readonly type: 'reroll'; readonly dieIds: readonly string[] }
  | { readonly type: 'assign'; readonly dieId: string; readonly slot: number }
  | { readonly type: 'unassign'; readonly slot: number }
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
  | { readonly type: 'resolve'; readonly outcome: Outcome; readonly trophy: GameSymbol | null };

export interface CombatState {
  readonly monster: Monster;
  readonly hp: number;
  readonly maxHp: number;
  readonly dice: readonly Die[];
  /** Id del dado asignado a cada uno de los 4 slots, o null. */
  readonly assignments: readonly (string | null)[];
  /** Dados fuera de juego: corazones usados como escudo y dados de daño que ya hirieron. */
  readonly spent: readonly string[];
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

/** RF-11.5: Resultado que daría resolver ahora mismo (null si aún no hay símbolos). */
export function previewOutcome(state: CombatState): Exclude<Outcome, 'ko'> | null {
  const covered = coveredSlots(state);
  if (covered >= 4) return 'defeat';
  if (covered >= 2) return 'study';
  if (covered === 1) return 'flee';
  return null;
}

/** Slots libres que este dado podría cubrir — la UI lo usa para resaltar, sin calcular reglas. */
export function validSlotsFor(state: CombatState, dieId: string): number[] {
  if (state.status !== 'active') return [];
  const die = state.dice.find((d) => d.id === dieId);
  if (!die || !availableDice(state).some((d) => d.id === dieId)) return [];
  return state.monster.slots
    .map((slot, i) => (state.assignments[i] === null && faceMatchesSlot(die.face, slot) ? i : -1))
    .filter((i) => i >= 0);
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

    const shield = next.dice.find(
      (d) => d.face === 'heart' && !assignments.includes(d.id) && !spent.includes(d.id),
    );
    if (shield) spent.push(shield.id);
    const hp = shield ? next.hp : next.hp - 1;

    next = {
      ...next,
      hp,
      assignments,
      spent,
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

    // RF-11.6: KO. Si en ese momento el monstruo queda derrotado, se conservan los beneficios.
    if (hp <= 0) {
      const defeated = coveredSlots(next) === 4;
      const trophy = defeated ? (next.monster.trophies[0] ?? null) : null;
      const outcome: Outcome = defeated ? 'defeat' : 'ko';
      return {
        ...next,
        hp: 0,
        ko: true,
        status: 'resolved',
        outcome,
        trophy,
        log: [...next.log, { type: 'resolve', outcome, trophy }],
      };
    }
  }
  return next;
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
    assignments: [null, null, null, null],
    spent: [],
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

/** RF-11.3: Relanza los dados elegidos; cada relanzamiento añade un dado de daño blanco. */
function reroll(state: CombatState, dieIds: readonly string[], table: DiceTable): CombatState {
  if (dieIds.length === 0) throw new CombatError('Selecciona al menos un dado para relanzar');
  if (new Set(dieIds).size !== dieIds.length)
    throw new CombatError('Dados repetidos en el relanzamiento');
  const available = new Set(availableDice(state).map((d) => d.id));
  for (const id of dieIds) {
    getDie(state, id);
    if (!available.has(id)) throw new CombatError(`El dado "${id}" no está en la reserva`);
  }

  const rng = new SeededRng(state.rngState);
  const selected = new Set(dieIds);
  // Orden determinista: el de la reserva, no el del input
  const rerolled = state.dice.map((d) =>
    selected.has(d.id) ? { ...d, face: rollFace(d.kind, rng, table) } : d,
  );
  const white: Die = {
    id: `d${state.dice.length}`,
    kind: 'white',
    face: rollFace('white', rng, table),
  };
  const rolledIds = [...state.dice.filter((d) => selected.has(d.id)).map((d) => d.id), white.id];

  const next: CombatState = {
    ...state,
    dice: [...rerolled, white],
    rngState: rng.currentState,
    rerolls: state.rerolls + 1,
    log: [...state.log, { type: 'roll', dieIds: rolledIds, addedWhite: white.id }],
  };
  return applyDamage(next, rolledIds);
}

function assign(state: CombatState, dieId: string, slot: number): CombatState {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3)
    throw new CombatError(`Slot inválido: ${slot}`);
  const die = getDie(state, dieId);
  if (!availableDice(state).some((d) => d.id === dieId)) {
    throw new CombatError(`El dado "${dieId}" no está en la reserva`);
  }
  if (state.assignments[slot] !== null) throw new CombatError(`El slot ${slot} ya está cubierto`);
  const slotType = state.monster.slots[slot] as Slot;
  if (!faceMatchesSlot(die.face, slotType)) {
    throw new CombatError(`La cara "${die.face}" no cubre el slot "${slotType}"`);
  }
  const assignments = [...state.assignments];
  assignments[slot] = dieId;
  return { ...state, assignments, log: [...state.log, { type: 'assign', dieId, slot }] };
}

function unassign(state: CombatState, slot: number): CombatState {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3)
    throw new CombatError(`Slot inválido: ${slot}`);
  const dieId = state.assignments[slot];
  if (dieId === null || dieId === undefined) throw new CombatError(`El slot ${slot} está vacío`);
  if (state.monster.slots[slot] === 'damage') {
    throw new CombatError('El daño recibido no se puede deshacer');
  }
  const assignments = [...state.assignments];
  assignments[slot] = null;
  return { ...state, assignments, log: [...state.log, { type: 'unassign', dieId, slot }] };
}

/** RF-11.5: Derrotar (4 slots), Estudiar (2–3) o Huir (1). */
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
