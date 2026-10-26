// RF-15: Partida V0 — máquina de estados pura sobre todo el juego.
//   Pueblo (descansar / comprar) → salir → sendero (2 rastros ocultos) → combate →
//   resultado → seguir cazando o volver al pueblo.
// Toda la aleatoriedad sale de la seed de la partida, así que el servidor re-simula
// seed + acciones con `replayGame` exactamente igual que el cliente (Regla de oro 2).

import { applyAction, CombatError, pickEncounterPair, startCombat } from './combat.js';
import type { CombatAction, CombatState, Outcome } from './combat.js';
import { canHunt, endCombat, runCombatSetup, startRun } from './run.js';
import type { RunState } from './run.js';
import { SeededRng } from './rng.js';
import type { GameConfig } from './schemas.js';
import type { Ability, DiceTable, DieKind, GameSymbol, Monster, SpecialDieKind } from './types.js';

/** Todo lo que viene de config/: reglas, monstruos, habilidades y caras de los dados. */
export interface GameData {
  readonly config: GameConfig;
  readonly monsters: readonly Monster[];
  readonly abilities: readonly Ability[];
  readonly dice: DiceTable;
}

/** 'setup' = elegir el color del cazador (su dado especial) antes de la primera expedición. */
export type GamePhase = 'setup' | 'town' | 'trail' | 'combat' | 'aftermath' | 'over';

export interface OwnedItem {
  readonly id: string;
  /** false = gastado; se recarga al descansar en el pueblo. */
  readonly ready: boolean;
}

export interface GameState {
  readonly seed: string;
  readonly rngState: number;
  readonly phase: GamePhase;
  readonly hp: number;
  readonly maxHp: number;
  /** Dados propios del personaje (los que tiene al salir del pueblo). */
  readonly dice: readonly DieKind[];
  /** Expedición en curso, o null en el pueblo. */
  readonly run: RunState | null;
  readonly trophies: readonly GameSymbol[];
  readonly items: readonly OwnedItem[];
  readonly skills: readonly string[];
  /** Acciones que quedan en esta visita al pueblo. */
  readonly townActions: number;
  /** Cartas ofrecidas tras pagar en el tablero de misiones; hay que elegir una. */
  readonly offer: { readonly kind: Ability['kind']; readonly ids: readonly string[] } | null;
  /** Ids de los dos monstruos del sendero; la UI solo muestra su tipo (monstruos ocultos). */
  readonly trail: readonly [string, string] | null;
  readonly combat: CombatState | null;
  /** Trofeo ganado sin espacio libre: hay que decidir cuál conservar. */
  readonly pendingTrophy: GameSymbol | null;
  readonly points: number;
  readonly kos: number;
  readonly runs: number;
  readonly fights: number;
  readonly rerolls: number;
  readonly outcomes: Readonly<Partial<Record<Outcome, number>>>;
}

export type GameAction =
  | { readonly type: 'start'; readonly die: SpecialDieKind }
  | { readonly type: 'rest' }
  | { readonly type: 'buy'; readonly kind: Ability['kind']; readonly pay: readonly number[] }
  | { readonly type: 'pick'; readonly abilityId: string | null; readonly replace?: string }
  | { readonly type: 'leave' }
  | { readonly type: 'follow'; readonly index: number }
  | { readonly type: 'combat'; readonly action: CombatAction }
  | { readonly type: 'keep'; readonly discard: number | null }
  | { readonly type: 'continue' }
  | { readonly type: 'return' }
  | { readonly type: 'finish' };

const SYMBOLS: readonly GameSymbol[] = ['Horn', 'Wing', 'Claw', 'Tail'];
const UINT32_MAX = 0xffffffff;

function fail(message: string): never {
  throw new CombatError(message);
}

/** Tirar el dado de trofeo equivale a un símbolo uniforme (manual p. 5 y 7). */
function randomTrophy(rng: SeededRng): GameSymbol {
  return SYMBOLS[rng.nextInt(0, SYMBOLS.length - 1)] as GameSymbol;
}

/** Muestra sin reemplazo (Fisher–Yates parcial), determinista con el RNG de la partida. */
function sample<T>(rng: SeededRng, list: readonly T[], n: number): T[] {
  const pool = [...list];
  const picked: T[] = [];
  while (picked.length < n && pool.length > 0) {
    const [item] = pool.splice(rng.nextInt(0, pool.length - 1), 1);
    picked.push(item as T);
  }
  return picked;
}

export function findAbility(data: GameData, id: string): Ability {
  return data.abilities.find((a) => a.id === id) ?? fail(`La habilidad "${id}" no existe`);
}

function findMonster(data: GameData, id: string): Monster {
  return data.monsters.find((m) => m.id === id) ?? fail(`El monstruo "${id}" no existe`);
}

function ownedIds(state: GameState): string[] {
  return [...state.items.map((i) => i.id), ...state.skills];
}

/** Espacios para trofeos: los del personaje más las bonificaciones de las cartas que tenga. */
export function trophyCapacity(state: GameState, data: GameData): number {
  const bonus = ownedIds(state).filter((id) => findAbility(data, id).bonus === 'trophySlot');
  return data.config.player.trophySlots + bonus.length;
}

/** Habilidades que se pueden usar en el próximo combate: objetos cargados y destrezas. */
export function readyAbilities(state: GameState, data: GameData): Ability[] {
  return [
    ...state.items.filter((i) => i.ready).map((i) => findAbility(data, i.id)),
    ...state.skills.map((id) => findAbility(data, id)),
  ];
}

/**
 * Puntaje final V0: puntos − KOs × 3 − expediciones (los pesos vienen de config/).
 * Solo cuentan las expediciones terminadas: la partida empieza en 0, no en −1.
 */
export function finalScore(state: GameState, config: GameConfig): number {
  const { koWeight, runWeight } = config.scoring;
  const runs = state.run ? state.runs - 1 : state.runs;
  return state.points - state.kos * koWeight - runs * runWeight;
}

function newTrail(data: GameData, rng: SeededRng): [string, string] {
  const [a, b] = pickEncounterPair(data.monsters, rng.nextInt(0, UINT32_MAX));
  return [a.id, b.id];
}

/** Gana un trofeo: si no hay espacio, queda pendiente hasta decidir cuál conservar. */
function gainTrophy(state: GameState, data: GameData, symbol: GameSymbol): GameState {
  if (state.trophies.length < trophyCapacity(state, data)) {
    return { ...state, trophies: [...state.trophies, symbol] };
  }
  return { ...state, pendingTrophy: symbol };
}

const SPECIAL_DICE: readonly SpecialDieKind[] = ['orange', 'blue', 'purple', 'green'];

/**
 * Empieza una partida con lo que indica el manual (p. 7): 4 dados estándar, 1 trofeo y
 * 1 objeto al azar. Primero se elige el color del cazador, que da su dado especial
 * (`start`); después la ronda arranca con la expedición, como en el juego de mesa, y el
 * pueblo llega al volver (revisión del equipo, 2026-10-25).
 */
export function newGame(data: GameData, seed: string): GameState {
  const { player, town } = data.config;
  const rng = new SeededRng(seed);
  const trophies = Array.from({ length: player.startingTrophies }, () => randomTrophy(rng));
  const catalog = data.abilities.filter((a) => a.kind === 'item');
  const items = sample(rng, catalog, player.startingItems).map((a) => ({ id: a.id, ready: true }));
  return {
    seed,
    rngState: rng.currentState,
    phase: 'setup',
    hp: player.maxHp,
    maxHp: player.maxHp,
    dice: [...player.startingDice],
    run: null,
    trophies,
    items,
    skills: [],
    townActions: town.actionsPerVisit,
    offer: null,
    trail: null,
    combat: null,
    pendingTrophy: null,
    points: 0,
    kos: 0,
    runs: 0,
    fights: 0,
    rerolls: 0,
    outcomes: {},
  };
}

function requirePhase(state: GameState, ...phases: GamePhase[]): void {
  if (!phases.includes(state.phase)) fail(`Acción no disponible en la fase "${state.phase}"`);
}

function spendTownAction(state: GameState): void {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  if (state.townActions <= 0) fail('No te quedan acciones en el pueblo');
}

/** DESCANSAR (manual p. 14): sana por completo, recarga todos los objetos y gana un trofeo. */
function rest(state: GameState, data: GameData): GameState {
  spendTownAction(state);
  const rng = new SeededRng(state.rngState);
  const trophy = randomTrophy(rng);
  return gainTrophy(
    {
      ...state,
      rngState: rng.currentState,
      hp: state.maxHp,
      items: state.items.map((i) => ({ ...i, ready: true })),
      townActions: state.townActions - 1,
    },
    data,
    trophy,
  );
}

/**
 * COMPRAR (misiones de aldeanos / Huntmaster, manual p. 15): se pagan trofeos y se roban
 * cartas del tipo elegido para quedarse con una. Los trofeos funcionan como dinero.
 */
function buy(
  state: GameState,
  data: GameData,
  kind: Ability['kind'],
  pay: readonly number[],
): GameState {
  spendTownAction(state);
  const { town } = data.config;
  const cost = kind === 'item' ? town.itemCost : town.skillCost;
  if (pay.length !== cost) fail(`Cuesta ${cost} trofeo(s)`);
  if (new Set(pay).size !== pay.length) fail('Trofeos repetidos en el pago');
  for (const i of pay) {
    if (!Number.isInteger(i) || i < 0 || i >= state.trophies.length)
      fail(`No tienes el trofeo ${i}`);
  }
  const owned = ownedIds(state);
  const candidates = data.abilities.filter((a) => a.kind === kind && !owned.includes(a.id));
  if (candidates.length === 0) fail('No quedan cartas de ese tipo');
  const rng = new SeededRng(state.rngState);
  const ids = sample(rng, candidates, town.offerSize).map((a) => a.id);
  return {
    ...state,
    rngState: rng.currentState,
    trophies: state.trophies.filter((_, i) => !pay.includes(i)),
    townActions: state.townActions - 1,
    offer: { kind, ids },
  };
}

/** Quita una carta. Si era una destreza de dado especial, el dado se va con ella. */
function discard(state: GameState, data: GameData, id: string): GameState {
  const ability = findAbility(data, id);
  if (ability.kind === 'item') return { ...state, items: state.items.filter((i) => i.id !== id) };
  const { effect } = ability;
  let dice = state.dice;
  if (effect.type === 'special') {
    const at = dice.lastIndexOf(effect.die);
    dice = dice.filter((_, i) => i !== at);
  }
  return { ...state, dice, skills: state.skills.filter((s) => s !== id) };
}

/** Elige una de las cartas ofrecidas (null = no quedarse con ninguna). Máximo 3 de cada tipo. */
function pick(
  state: GameState,
  data: GameData,
  abilityId: string | null,
  replace: string | undefined,
): GameState {
  const { offer } = state;
  if (!offer) fail('No hay cartas para elegir');
  if (abilityId === null) return { ...state, offer: null };
  if (!offer.ids.includes(abilityId)) fail(`"${abilityId}" no está entre las cartas ofrecidas`);
  const ability = findAbility(data, abilityId);
  const { town } = data.config;
  const max = ability.kind === 'item' ? town.maxItems : town.maxSkills;
  const sameKind = ability.kind === 'item' ? state.items.map((i) => i.id) : state.skills;

  let next: GameState = { ...state, offer: null };
  if (sameKind.length >= max) {
    if (!replace || !sameKind.includes(replace)) fail(`Ya tienes ${max}: elige cuál reemplazar`);
    next = discard(next, data, replace);
  } else if (replace !== undefined) {
    fail('Aún tienes espacio: no hace falta reemplazar');
  }
  if (ability.kind === 'item') {
    return { ...next, items: [...next.items, { id: abilityId, ready: true }] };
  }
  const { effect } = ability;
  return {
    ...next,
    skills: [...next.skills, abilityId],
    dice: effect.type === 'special' ? [...next.dice, effect.die] : next.dice,
  };
}

/** Salir del pueblo: empieza la expedición con todos los dados y el HPie que se tenga. */
function leave(state: GameState, data: GameData): GameState {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  const rng = new SeededRng(state.rngState);
  const trail = newTrail(data, rng);
  return {
    ...state,
    rngState: rng.currentState,
    phase: 'trail',
    run: startRun({ dice: state.dice, maxHp: state.maxHp, hp: state.hp }),
    runs: state.runs + 1,
    trail,
  };
}

/** Lleva el resultado del combate a la partida: dados, HPie, trofeos, objetos y puntos. */
function settle(state: GameState, data: GameData, combat: CombatState): GameState {
  const run = endCombat(state.run as RunState, combat);
  const outcome = combat.outcome as Outcome;
  const { scoring } = data.config;
  const koPenalty = combat.ko && outcome !== 'ko' ? scoring.ko : 0;
  const next: GameState = {
    ...state,
    phase: 'aftermath',
    combat,
    run,
    hp: run.hp,
    // Los trofeos colocados en el monstruo se gastaron
    trophies: combat.trophies,
    items: state.items.map((i) =>
      combat.usedAbilities.includes(i.id) ? { ...i, ready: false } : i,
    ),
    points: state.points + scoring[outcome] + koPenalty,
    kos: state.kos + (combat.ko ? 1 : 0),
    fights: state.fights + 1,
    rerolls: state.rerolls + combat.rerolls,
    outcomes: { ...state.outcomes, [outcome]: (state.outcomes[outcome] ?? 0) + 1 },
  };
  return combat.trophy ? gainTrophy(next, data, combat.trophy) : next;
}

/** Sigue el rastro elegido: el monstruo se revela y empieza el combate. */
function follow(state: GameState, data: GameData, index: number): GameState {
  const run = state.run as RunState;
  if (!canHunt(run)) fail('No quedan dados: vuelve al pueblo');
  const id = state.trail?.[index];
  if (id === undefined) fail(`No hay rastro ${index}`);
  const rng = new SeededRng(state.rngState);
  const combat = startCombat(
    findMonster(data, id),
    {
      ...runCombatSetup(run),
      trophies: state.trophies,
      abilities: readyAbilities(state, data),
    },
    rng.nextInt(0, UINT32_MAX),
    data.dice,
  );
  const next: GameState = {
    ...state,
    rngState: rng.currentState,
    phase: 'combat',
    trail: null,
    combat,
  };
  // Los blancos que quedaron en la reserva pueden dejarte KO al lanzar
  return combat.status === 'resolved' ? settle(next, data, combat) : next;
}

function keep(state: GameState, discardIndex: number | null): GameState {
  const symbol = state.pendingTrophy;
  if (symbol === null) fail('No hay trofeo pendiente');
  if (discardIndex === null) return { ...state, pendingTrophy: null };
  if (!Number.isInteger(discardIndex) || state.trophies[discardIndex] === undefined) {
    fail(`No tienes el trofeo ${discardIndex}`);
  }
  return {
    ...state,
    pendingTrophy: null,
    trophies: [...state.trophies.filter((_, i) => i !== discardIndex), symbol],
  };
}

/** Siguiente encuentro de la misma expedición. */
function next(state: GameState, data: GameData): GameState {
  const run = state.run as RunState;
  if (run.status !== 'active') fail('La expedición terminó: vuelve al pueblo');
  if (!canHunt(run)) fail('No quedan dados: vuelve al pueblo');
  const rng = new SeededRng(state.rngState);
  const trail = newTrail(data, rng);
  return { ...state, rngState: rng.currentState, phase: 'trail', combat: null, trail };
}

/**
 * Volver al pueblo: se recuperan los dados y se retiran los blancos. El HPie no se recupera
 * solo: hay que descansar (D-21), salvo tras un KO, que lo recupera todo (manual p. 11).
 */
function goToTown(state: GameState, data: GameData): GameState {
  return {
    ...state,
    phase: 'town',
    run: null,
    hp: state.run?.endedBy === 'ko' ? state.maxHp : state.hp,
    combat: null,
    trail: null,
    townActions: data.config.town.actionsPerVisit,
  };
}

/** Elige el color del cazador: su dado especial se suma a los dados y sale de expedición. */
function start(state: GameState, data: GameData, die: SpecialDieKind): GameState {
  if (!SPECIAL_DICE.includes(die)) fail(`"${die}" no es un dado especial`);
  return leave({ ...state, dice: [...state.dice, die] }, data);
}

/** Aplica una acción de la partida. Lanza CombatError si no es válida en el estado actual. */
export function applyGameAction(state: GameState, action: GameAction, data: GameData): GameState {
  if (state.phase === 'over') fail('La partida terminó');
  if (state.pendingTrophy !== null && action.type !== 'keep') {
    fail('Primero decide qué trofeo conservar');
  }
  switch (action.type) {
    case 'start':
      requirePhase(state, 'setup');
      return start(state, data, action.die);
    case 'rest':
      requirePhase(state, 'town');
      return rest(state, data);
    case 'buy':
      requirePhase(state, 'town');
      return buy(state, data, action.kind, action.pay);
    case 'pick':
      requirePhase(state, 'town');
      return pick(state, data, action.abilityId, action.replace);
    case 'leave':
      requirePhase(state, 'town');
      return leave(state, data);
    case 'follow':
      requirePhase(state, 'trail');
      return follow(state, data, action.index);
    case 'combat': {
      requirePhase(state, 'combat');
      const combat = applyAction(state.combat as CombatState, action.action, data.dice);
      return combat.status === 'resolved' ? settle(state, data, combat) : { ...state, combat };
    }
    case 'keep':
      return keep(state, action.discard);
    case 'continue':
      requirePhase(state, 'aftermath');
      return next(state, data);
    case 'return':
      requirePhase(state, 'trail', 'aftermath');
      return goToTown(state, data);
    case 'finish':
      requirePhase(state, 'town');
      if (state.offer) fail('Primero elige una de las cartas ofrecidas');
      return { ...state, phase: 'over' };
    default:
      return fail('Acción desconocida');
  }
}

/** Regla de oro 2: el servidor re-simula la partida completa desde seed + acciones. */
export function replayGame(
  data: GameData,
  seed: string,
  actions: readonly GameAction[],
): GameState {
  return actions.reduce((s, a) => applyGameAction(s, a, data), newGame(data, seed));
}
