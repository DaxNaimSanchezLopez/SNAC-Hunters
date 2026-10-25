// RF-15: Partida — máquina de estados pura sobre todo el juego.
//   Pueblo (descansar / comprar) → salir → mapa de la región → combate → resultado →
//   seguir por el mapa o volver al pueblo.
// V1 (roguelite sencillo): mapa estilo FTL con el jefe al final, 3 vidas, Pieland
// amenazada por una cuenta regresiva, carta de misión secreta y puntaje final.
// Toda la aleatoriedad sale de la seed de la partida, así que el servidor re-simula
// seed + acciones con `replayGame` exactamente igual que el cliente (Regla de oro 2).

import { applyAction, CombatError, startCombat } from './combat.js';
import type { CombatAction, CombatState, Outcome } from './combat.js';
import { canHunt, endCombat, runCombatSetup, startRun } from './run.js';
import type { RunState } from './run.js';
import { SeededRng } from './rng.js';
import type { GameConfig } from './schemas.js';
import type {
  Ability,
  DiceTable,
  DieKind,
  GameSymbol,
  Monster,
  SecretQuest,
  Slot,
} from './types.js';

/** Todo lo que viene de config/: reglas, monstruos, habilidades, misiones y dados. */
export interface GameData {
  readonly config: GameConfig;
  readonly monsters: readonly Monster[];
  readonly abilities: readonly Ability[];
  readonly quests: readonly SecretQuest[];
  readonly dice: DiceTable;
}

/** 'trail' = en el mapa, eligiendo el siguiente nodo. */
export type GamePhase = 'town' | 'trail' | 'combat' | 'aftermath' | 'over';

/** Cómo terminó la partida (V1): ganó, se quedó sin vidas, cayó Pieland o la abandonó. */
export type GameResult = 'victory' | 'lives' | 'pieland' | 'abandon';

export interface OwnedItem {
  readonly id: string;
  /** false = gastado; se recarga al descansar en el pueblo. */
  readonly ready: boolean;
}

/** Nodo del mapa de la región: solo se conoce el tipo de monstruo hasta pelear. */
export interface MapNode {
  readonly id: string;
  readonly column: number;
  readonly type: GameSymbol;
  readonly monsterId: string;
  /** Nodos de la siguiente columna a los que lleva un camino. */
  readonly next: readonly string[];
}

/** Mapa estilo FTL (feedback, sección 7): columnas de nodos del pueblo al jefe. */
export interface GameMap {
  readonly nodes: readonly MapNode[];
  readonly columns: number;
}

export const BOSS_NODE = 'boss';

export interface Pieland {
  readonly hp: number;
  /** Cuenta regresiva en curso (índice en config.pieland.countdown). */
  readonly stage: number;
  /** Expediciones que faltan para que Pieland pierda 1 PV. */
  readonly left: number;
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
  /** Mapa de la expedición en curso (se genera de nuevo en cada expedición). */
  readonly map: GameMap | null;
  /** Nodo donde está el cazador; null = recién salió del pueblo. */
  readonly position: string | null;
  /** Jefe de la región: sus espacios se sortean al empezar la partida. */
  readonly boss: Monster;
  readonly combat: CombatState | null;
  /** Trofeo ganado sin espacio libre: hay que decidir cuál conservar. */
  readonly pendingTrophy: GameSymbol | null;
  readonly lives: number;
  readonly pieland: Pieland;
  /** Id de la carta de misión secreta repartida al empezar. */
  readonly quest: string;
  /** Tipos de los monstruos derrotados (para la misión secreta y Well Traveled). */
  readonly defeated: readonly GameSymbol[];
  /** Trofeos pagados en las misiones del pueblo (cuentan como "misiones" de la carta secreta). */
  readonly paid: readonly GameSymbol[];
  readonly result: GameResult | null;
  readonly points: number;
  readonly kos: number;
  readonly runs: number;
  readonly fights: number;
  readonly rerolls: number;
  readonly outcomes: Readonly<Partial<Record<Outcome, number>>>;
}

export type GameAction =
  | { readonly type: 'rest' }
  | { readonly type: 'buy'; readonly kind: Ability['kind']; readonly pay: readonly number[] }
  | { readonly type: 'pick'; readonly abilityId: string | null; readonly replace?: string }
  | { readonly type: 'recharge'; readonly target: string }
  | { readonly type: 'leave' }
  | { readonly type: 'follow'; readonly node: string }
  | { readonly type: 'combat'; readonly action: CombatAction }
  | { readonly type: 'keep'; readonly discard: number | null }
  | { readonly type: 'continue' }
  | { readonly type: 'return' }
  | { readonly type: 'finish' };

const SYMBOLS: readonly GameSymbol[] = ['Horn', 'Wing', 'Claw', 'Tail'];
const SPECIAL_DICE: readonly DieKind[] = ['orange', 'blue', 'purple', 'green'];
const UINT32_MAX = 0xffffffff;

function fail(message: string): never {
  throw new CombatError(message);
}

/** Tirar el dado de trofeo equivale a un símbolo uniforme (manual p. 5 y 7). */
function randomSymbol(rng: SeededRng): GameSymbol {
  return SYMBOLS[rng.nextInt(0, SYMBOLS.length - 1)] as GameSymbol;
}

function pickOne<T>(rng: SeededRng, list: readonly T[]): T {
  return list[rng.nextInt(0, list.length - 1)] as T;
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

export function findQuest(data: GameData, id: string): SecretQuest {
  return data.quests.find((q) => q.id === id) ?? fail(`La misión "${id}" no existe`);
}

function ownedIds(state: GameState): string[] {
  return [...state.items.map((i) => i.id), ...state.skills];
}

function owned(state: GameState, data: GameData): Ability[] {
  return ownedIds(state).map((id) => findAbility(data, id));
}

/** Espacios para trofeos: los del personaje más las bonificaciones de las cartas que tenga. */
export function trophyCapacity(state: GameState, data: GameData): number {
  const bonus = owned(state, data).filter((a) => a.bonus === 'trophySlot');
  return data.config.player.trophySlots + bonus.length;
}

/** Habilidades que se pueden usar en el próximo combate: objetos cargados y destrezas. */
export function readyAbilities(state: GameState, data: GameData): Ability[] {
  return [
    ...state.items.filter((i) => i.ready).map((i) => findAbility(data, i.id)),
    ...state.skills.map((id) => findAbility(data, id)),
  ];
}

/** Monstruo de un nodo del mapa (el jefe incluido). */
export function nodeMonster(state: GameState, data: GameData, nodeId: string): Monster {
  if (nodeId === BOSS_NODE) return state.boss;
  const node = state.map?.nodes.find((n) => n.id === nodeId) ?? fail(`No hay nodo ${nodeId}`);
  return data.monsters.find((m) => m.id === node.monsterId) ?? fail(`No existe ${node.monsterId}`);
}

/** Nodos a los que se puede ir ahora: la primera columna al salir, o los conectados. */
export function reachableNodes(state: GameState): string[] {
  const map = state.map;
  if (!map) return [];
  if (state.position === null) return map.nodes.filter((n) => n.column === 0).map((n) => n.id);
  if (state.position === BOSS_NODE) return [];
  return [...(map.nodes.find((n) => n.id === state.position)?.next ?? [])];
}

// ---------------------------------------------------------------------------------------
// Puntaje
// ---------------------------------------------------------------------------------------

export interface ScoreBreakdown {
  readonly points: number;
  readonly koPenalty: number;
  readonly runPenalty: number;
  /** Misión secreta: monstruos del tipo, trofeos pagados en misiones y trofeos guardados. */
  readonly quest: number;
  /** Cartas de puntos (Piebix Cube, Varied Samples, Well Traveled). */
  readonly cards: number;
  readonly victory: number;
  readonly total: number;
}

function distinct<T>(list: readonly T[]): number {
  return new Set(list).size;
}

/**
 * Puntaje final: puntos − KOs × 3 − expediciones (V0) más la misión secreta, las cartas de
 * puntos y el bonus por derrotar al jefe (V1). Todos los pesos vienen de config/.
 */
export function scoreBreakdown(state: GameState, data: GameData): ScoreBreakdown {
  const { scoring } = data.config;
  const quest = findQuest(data, state.quest);
  const questPoints =
    state.defeated.filter((t) => t === quest.monsterType).length +
    state.paid.filter((s) => quest.symbols.includes(s)).length +
    state.trophies.filter((s) => quest.symbols.includes(s)).length;
  const cards = owned(state, data).reduce((sum, a) => {
    if (a.effect.type !== 'points') return sum;
    const count =
      a.effect.by === 'specialDice'
        ? distinct(state.dice.filter((d) => SPECIAL_DICE.includes(d)))
        : a.effect.by === 'trophyTypes'
          ? distinct(state.trophies)
          : distinct(state.defeated);
    return sum + Math.min(count, scoring.pointsCardMax);
  }, 0);
  const koPenalty = state.kos * scoring.koWeight;
  const runPenalty = state.runs * scoring.runWeight;
  const victory = state.result === 'victory' ? scoring.victoryBonus : 0;
  return {
    points: state.points,
    koPenalty,
    runPenalty,
    quest: questPoints,
    cards,
    victory,
    total: state.points - koPenalty - runPenalty + questPoints + cards + victory,
  };
}

export function finalScore(state: GameState, data: GameData): number {
  return scoreBreakdown(state, data).total;
}

// ---------------------------------------------------------------------------------------
// Generación: jefe y mapa
// ---------------------------------------------------------------------------------------

/** Pieous Assassin: "Any type, Random symbols" (lista de monstruos), 6 espacios (brief). */
function makeBoss(data: GameData, rng: SeededRng): Monster {
  const { boss } = data.config;
  const slots: Slot[] = Array.from({ length: boss.slots }, () => randomSymbol(rng));
  return {
    id: boss.id,
    name: boss.name,
    type: slots[0] as GameSymbol,
    slots,
    trophies: [...SYMBOLS],
    pun: boss.pun,
    boss: true,
  };
}

/** Índice equivalente en una columna de otro tamaño (para trazar caminos sin cruces). */
function scale(i: number, from: number, to: number): number {
  return from <= 1 ? Math.floor((to - 1) / 2) : Math.round((i * (to - 1)) / (from - 1));
}

/**
 * Mapa estilo FTL: columnas de 2–3 nodos; cada nodo lleva a los más cercanos de la siguiente
 * columna y todos los de la última llevan al jefe. Los tipos (y el monstruo oculto de cada
 * nodo) son aleatorios y cambian en cada expedición.
 */
function makeMap(data: GameData, rng: SeededRng): GameMap {
  const { columns, minNodes, maxNodes } = data.config.map;
  const sizes = Array.from({ length: columns }, () => rng.nextInt(minNodes, maxNodes));
  const id = (c: number, i: number) => `c${c}n${i}`;
  const nodes: MapNode[] = [];
  sizes.forEach((size, c) => {
    const nextSize = sizes[c + 1];
    for (let i = 0; i < size; i++) {
      const type = randomSymbol(rng);
      const ofType = data.monsters.filter((m) => m.type === type);
      const monster = pickOne(rng, ofType.length > 0 ? ofType : data.monsters);
      const next = new Set<string>();
      if (nextSize === undefined) next.add(BOSS_NODE);
      else {
        next.add(id(c + 1, scale(i, size, nextSize)));
        for (let j = 0; j < nextSize; j++) {
          if (scale(j, nextSize, size) === i) next.add(id(c + 1, j));
        }
      }
      nodes.push({ id: id(c, i), column: c, type, monsterId: monster.id, next: [...next].sort() });
    }
  });
  return { nodes, columns };
}

/** Gana un trofeo: si no hay espacio, queda pendiente hasta decidir cuál conservar. */
function gainTrophy(state: GameState, data: GameData, symbol: GameSymbol): GameState {
  if (state.trophies.length < trophyCapacity(state, data)) {
    return { ...state, trophies: [...state.trophies, symbol] };
  }
  return { ...state, pendingTrophy: symbol };
}

/** Empieza una partida en el pueblo con lo que indica el manual (p. 7) y la carta secreta. */
export function newGame(data: GameData, seed: string): GameState {
  const { player, town, pieland } = data.config;
  const rng = new SeededRng(seed);
  const trophies = Array.from({ length: player.startingTrophies }, () => randomSymbol(rng));
  const catalog = data.abilities.filter((a) => a.kind === 'item');
  const items = sample(rng, catalog, player.startingItems).map((a) => ({ id: a.id, ready: true }));
  const quest = pickOne(rng, data.quests).id;
  const boss = makeBoss(data, rng);
  return {
    seed,
    rngState: rng.currentState,
    phase: 'town',
    hp: player.maxHp,
    maxHp: player.maxHp,
    dice: [...player.startingDice],
    run: null,
    trophies,
    items,
    skills: [],
    townActions: town.actionsPerVisit,
    offer: null,
    map: null,
    position: null,
    boss,
    combat: null,
    pendingTrophy: null,
    lives: data.config.lives,
    pieland: { hp: pieland.hp, stage: 0, left: pieland.countdown[0] as number },
    quest,
    defeated: [],
    paid: [],
    result: null,
    points: 0,
    kos: 0,
    runs: 0,
    fights: 0,
    rerolls: 0,
    outcomes: {},
  };
}

// ---------------------------------------------------------------------------------------
// Pueblo
// ---------------------------------------------------------------------------------------

function requirePhase(state: GameState, ...phases: GamePhase[]): void {
  if (!phases.includes(state.phase)) fail(`Acción no disponible en la fase "${state.phase}"`);
}

function spendTownAction(state: GameState): void {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  if (state.townActions <= 0) fail('No te quedan acciones en el pueblo');
}

/** DESCANSAR (manual p. 14): recarga todos los objetos y gana un trofeo al azar. */
function rest(state: GameState, data: GameData): GameState {
  spendTownAction(state);
  const rng = new SeededRng(state.rngState);
  const trophy = randomSymbol(rng);
  return gainTrophy(
    {
      ...state,
      rngState: rng.currentState,
      items: state.items.map((i) => ({ ...i, ready: true })),
      townActions: state.townActions - 1,
    },
    data,
    trophy,
  );
}

/**
 * COMPRAR (misiones de aldeanos / Huntmaster, manual p. 15): se pagan trofeos y se roban
 * cartas del tipo elegido para quedarse con una. Los trofeos funcionan como dinero, y los
 * pagados cuentan como "misiones" para la carta secreta (D-31).
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
    if (!Number.isInteger(i) || i < 0 || i >= state.trophies.length) {
      fail(`No tienes el trofeo ${i}`);
    }
  }
  const mine = ownedIds(state);
  const candidates = data.abilities.filter((a) => a.kind === kind && !mine.includes(a.id));
  if (candidates.length === 0) fail('No quedan cartas de ese tipo');
  const rng = new SeededRng(state.rngState);
  const ids = sample(rng, candidates, town.offerSize).map((a) => a.id);
  return {
    ...state,
    rngState: rng.currentState,
    trophies: state.trophies.filter((_, i) => !pay.includes(i)),
    paid: [...state.paid, ...pay.map((i) => state.trophies[i] as GameSymbol)],
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

/** Cloning Tool (V1): fuera de combate, recarga otro objeto gastado. No gasta acción. */
function recharge(state: GameState, data: GameData, target: string): GameState {
  const tool = state.items.find(
    (i) => i.ready && findAbility(data, i.id).effect.type === 'recharge',
  );
  if (!tool) fail('No tienes un objeto de recarga listo');
  const item = state.items.find((i) => i.id === target);
  if (!item || item.id === tool.id) fail(`No tienes otro objeto "${target}"`);
  if (item.ready) fail(`${findAbility(data, target).name} ya está cargado`);
  return {
    ...state,
    items: state.items.map((i) =>
      i.id === tool.id ? { ...i, ready: false } : i.id === target ? { ...i, ready: true } : i,
    ),
  };
}

// ---------------------------------------------------------------------------------------
// Expedición
// ---------------------------------------------------------------------------------------

/** Salir del pueblo: HPie y dados completos y un mapa nuevo de la región. */
function leave(state: GameState, data: GameData): GameState {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  const rng = new SeededRng(state.rngState);
  const map = makeMap(data, rng);
  return {
    ...state,
    rngState: rng.currentState,
    phase: 'trail',
    run: startRun({ dice: state.dice, maxHp: state.maxHp }),
    hp: state.maxHp,
    runs: state.runs + 1,
    map,
    position: null,
  };
}

/** Lleva el resultado del combate a la partida: dados, HPie, trofeos, vidas y puntos. */
function settle(state: GameState, data: GameData, combat: CombatState): GameState {
  const run = endCombat(state.run as RunState, combat);
  const outcome = combat.outcome as Outcome;
  const { scoring } = data.config;
  const koPenalty = combat.ko && outcome !== 'ko' ? scoring.ko : 0;
  const lives = state.lives - (combat.ko ? 1 : 0);
  const defeatedBoss = outcome === 'defeat' && combat.monster.boss === true;
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
    lives,
    defeated:
      outcome === 'defeat' && !combat.monster.boss
        ? [...state.defeated, combat.monster.type]
        : state.defeated,
    result: defeatedBoss ? 'victory' : lives <= 0 ? 'lives' : state.result,
    fights: state.fights + 1,
    rerolls: state.rerolls + combat.rerolls,
    outcomes: { ...state.outcomes, [outcome]: (state.outcomes[outcome] ?? 0) + 1 },
  };
  return combat.trophy ? gainTrophy(next, data, combat.trophy) : next;
}

/** Va al nodo elegido del mapa: el monstruo se revela y empieza el combate. */
function follow(state: GameState, data: GameData, nodeId: string): GameState {
  const run = state.run as RunState;
  if (!canHunt(run)) fail('No quedan dados: vuelve al pueblo');
  if (!reachableNodes(state).includes(nodeId)) fail(`No hay camino al nodo ${nodeId}`);
  const rng = new SeededRng(state.rngState);
  const combat = startCombat(
    nodeMonster(state, data, nodeId),
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
    position: nodeId,
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

/** Seguir por el mapa en la misma expedición. */
function next(state: GameState): GameState {
  const run = state.run as RunState;
  if (state.result !== null) fail('La partida terminó: ve al puntaje');
  if (run.status !== 'active') fail('La expedición terminó: vuelve al pueblo');
  if (!canHunt(run)) fail('No quedan dados: vuelve al pueblo');
  return { ...state, phase: 'trail', combat: null };
}

/**
 * Cuenta regresiva de Pieland (feedback, sección 9): cada expedición que termina sin derrotar
 * al jefe descuenta una; al agotarse, Pieland pierde 1 PV y empieza otra más corta.
 */
function countDown(pieland: Pieland, countdown: readonly number[]): Pieland {
  if (pieland.left > 1) return { ...pieland, left: pieland.left - 1 };
  const stage = pieland.stage + 1;
  const left = countdown[Math.min(stage, countdown.length - 1)] as number;
  return { hp: pieland.hp - 1, stage, left };
}

/**
 * Volver al pueblo: se recuperan el HPie y los dados, y se retiran los blancos. Aquí se
 * decide el game over (feedback, sección 8): sin vidas o con Pieland en 0 → puntaje.
 */
function goToTown(state: GameState, data: GameData): GameState {
  if (state.result !== null) return { ...state, phase: 'over', combat: null, map: null };
  const pieland = countDown(state.pieland, data.config.pieland.countdown);
  return {
    ...state,
    phase: pieland.hp <= 0 ? 'over' : 'town',
    result: pieland.hp <= 0 ? 'pieland' : null,
    pieland,
    run: null,
    hp: state.maxHp,
    combat: null,
    map: null,
    position: null,
    townActions: data.config.town.actionsPerVisit,
  };
}

/** Aplica una acción de la partida. Lanza CombatError si no es válida en el estado actual. */
export function applyGameAction(state: GameState, action: GameAction, data: GameData): GameState {
  if (state.phase === 'over') fail('La partida terminó');
  if (state.pendingTrophy !== null && action.type !== 'keep') {
    fail('Primero decide qué trofeo conservar');
  }
  switch (action.type) {
    case 'rest':
      requirePhase(state, 'town');
      return rest(state, data);
    case 'buy':
      requirePhase(state, 'town');
      return buy(state, data, action.kind, action.pay);
    case 'pick':
      requirePhase(state, 'town');
      return pick(state, data, action.abilityId, action.replace);
    case 'recharge':
      requirePhase(state, 'town', 'trail', 'aftermath');
      return recharge(state, data, action.target);
    case 'leave':
      requirePhase(state, 'town');
      return leave(state, data);
    case 'follow':
      requirePhase(state, 'trail');
      return follow(state, data, action.node);
    case 'combat': {
      requirePhase(state, 'combat');
      const combat = applyAction(state.combat as CombatState, action.action, data.dice);
      return combat.status === 'resolved' ? settle(state, data, combat) : { ...state, combat };
    }
    case 'keep':
      return keep(state, action.discard);
    case 'continue':
      requirePhase(state, 'aftermath');
      return next(state);
    case 'return':
      requirePhase(state, 'trail', 'aftermath');
      return goToTown(state, data);
    case 'finish':
      requirePhase(state, 'town');
      if (state.offer) fail('Primero elige una de las cartas ofrecidas');
      return { ...state, phase: 'over', result: 'abandon' };
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
