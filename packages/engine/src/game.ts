// RF-15: Partida — máquina de estados pura sobre todo el juego.
//   Color del cazador y misión secreta → expedición (mapa estilo FTL con monstruos ocultos y el
//   jefe al final) → combate → resultado → seguir por el mapa o volver al pueblo.
// V1 (roguelite sencillo): 3 vidas y Pieland amenazada con su cuenta regresiva.
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
  QuestCost,
  SecretQuest,
  Slot,
  SpecialDieKind,
  TownQuest,
} from './types.js';

/** Todo lo que viene de config/: reglas, monstruos, cartas, misiones y caras de los dados. */
export interface GameData {
  readonly config: GameConfig;
  readonly monsters: readonly Monster[];
  readonly abilities: readonly Ability[];
  readonly secretQuests: readonly SecretQuest[];
  readonly quests: readonly TownQuest[];
  readonly dice: DiceTable;
}

/**
 * 'setup' = elegir el color del cazador (su dado especial) y la misión secreta;
 * 'trail' = en el mapa de la región, eligiendo el siguiente nodo.
 */
export type GamePhase = 'setup' | 'town' | 'trail' | 'combat' | 'aftermath' | 'over';

/** Cómo terminó la partida (V1): ganó, se quedó sin vidas, cayó Pieland o la dejó. */
export type GameResult = 'victory' | 'lives' | 'pieland' | 'abandon';

/** Nodo del mapa de la región: solo se conoce el tipo de monstruo hasta pelear. */
export interface MapNode {
  readonly id: string;
  readonly column: number;
  readonly type: GameSymbol;
  readonly monsterId: string;
  /** Nodos de la siguiente columna a los que lleva un camino (o el jefe, desde la última). */
  readonly next: readonly string[];
}

/** Mapa estilo FTL (feedback 2026-10-20, sección 7): columnas de nodos del pueblo al jefe. */
export interface GameMap {
  readonly nodes: readonly MapNode[];
  readonly columns: number;
}

export const BOSS_NODE = 'boss';

/** Pieland amenazada (feedback 2026-10-20, sección 9). */
export interface Pieland {
  readonly hp: number;
  /** Cuenta regresiva en curso (índice en config.pieland.countdown). */
  readonly stage: number;
  /** Expediciones que faltan para que Pieland pierda 1 PV. */
  readonly left: number;
}

export interface OwnedItem {
  readonly id: string;
  /** false = gastado; se recarga al descansar en el pueblo. */
  readonly ready: boolean;
}

/** Misión a la vista en el tablero del pueblo. */
export interface QuestSlot {
  readonly id: string;
  /** Orden de llegada: la de menor número es la más antigua y es la siguiente en retirarse. */
  readonly since: number;
}

/** Puntaje de un run (feedback del cliente, 2026-11-03, "Partida sin terminar"). */
export interface RunScore {
  /** Número de expedición. */
  readonly run: number;
  readonly hunt: number;
  readonly questKills: number;
  readonly questTrophies: number;
  readonly cards: number;
  readonly total: number;
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
  /** Opciones del pueblo ya usadas en esta visita: cada una, una vez por visita. */
  readonly townUsed: readonly TownOption[];
  /** Visitas al pueblo (volver de una expedición cuenta como una). */
  readonly townVisits: number;
  /** Partida guiada: el pueblo desbloquea sus opciones poco a poco. */
  readonly guided: boolean;
  /** Cartas ofrecidas tras cumplir una misión del pueblo; hay que elegir una. */
  readonly offer: { readonly kind: Ability['kind']; readonly ids: readonly string[] } | null;
  /** Mapa de la expedición en curso (uno nuevo en cada expedición); la UI solo muestra tipos. */
  readonly map: GameMap | null;
  /** Nodo del mapa donde está el cazador (null = recién salió del pueblo). */
  readonly position: string | null;
  readonly combat: CombatState | null;
  /** Trofeo ganado sin espacio libre: hay que decidir cuál conservar. */
  readonly pendingTrophy: GameSymbol | null;
  /** Cartas de misión secreta para elegir al empezar (la primera partida solo usa la primera). */
  readonly secretOffer: readonly string[];
  readonly secretQuest: string | null;
  /** Tablero de misiones del pueblo (siempre 3) y mazo del que salen las nuevas. */
  readonly quests: readonly QuestSlot[];
  readonly questDeck: readonly string[];
  readonly questSerial: number;
  readonly completedQuests: readonly string[];
  /** Monstruos derrotados seguidos en este run: el siguiente vale (chain + 1) × 10. */
  readonly chain: number;
  readonly runHuntPoints: number;
  readonly runQuestKills: number;
  /** El mejor run terminado: es el puntaje si la partida no llega a derrotar al jefe. */
  readonly bestRun: RunScore | null;
  readonly bossDefeated: boolean;
  /** Tipos de los monstruos derrotados en la partida (para Well Traveled). */
  readonly defeatedTypes: readonly GameSymbol[];
  /** V1: vidas del cazador (cada KO cuesta una) y Pieland con su cuenta regresiva. */
  readonly lives: number;
  readonly pieland: Pieland;
  readonly result: GameResult | null;
  readonly kos: number;
  readonly runs: number;
  readonly fights: number;
  readonly rerolls: number;
  readonly outcomes: Readonly<Partial<Record<Outcome, number>>>;
}

/** Opciones del pueblo: descansar, misión de aldeano (objeto) y del Huntmaster (destreza). */
export type TownOption = 'rest' | Ability['kind'];

const TOWN_OPTIONS: readonly TownOption[] = ['rest', 'item', 'skill'];

/** Qué carta da cada tipo de misión del pueblo. */
const QUEST_REWARD: Record<TownQuest['kind'], Ability['kind']> = {
  villager: 'item',
  huntmaster: 'skill',
};

export type GameAction =
  | {
      readonly type: 'start';
      readonly die: SpecialDieKind;
      readonly guided?: boolean;
      /** Carta de misión secreta elegida (de `secretOffer`); por defecto, la primera. */
      readonly quest?: string;
    }
  | { readonly type: 'rest' }
  /** Cumple una misión del tablero; la de aldeano dice con cuál de sus opciones paga. */
  | { readonly type: 'quest'; readonly id: string; readonly pay?: QuestCost }
  | { readonly type: 'pick'; readonly abilityId: string; readonly replace?: string }
  | { readonly type: 'recharge'; readonly target: string }
  | { readonly type: 'leave' }
  /** Va a un nodo del mapa (o al jefe, `BOSS_NODE`). */
  | { readonly type: 'follow'; readonly node: string }
  | { readonly type: 'combat'; readonly action: CombatAction }
  | { readonly type: 'keep'; readonly discard: number | null }
  | { readonly type: 'continue' }
  | { readonly type: 'return' }
  | { readonly type: 'finish' };

const SYMBOLS: readonly GameSymbol[] = ['Horn', 'Wing', 'Claw', 'Tail'];
const SPECIAL_DICE: readonly SpecialDieKind[] = ['orange', 'blue', 'purple', 'green'];
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

export function findSecretQuest(data: GameData, id: string): SecretQuest {
  return data.secretQuests.find((q) => q.id === id) ?? fail(`La misión secreta "${id}" no existe`);
}

export function findQuest(data: GameData, id: string): TownQuest {
  return data.quests.find((q) => q.id === id) ?? fail(`La misión "${id}" no existe`);
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

// ---------------------------------------------------------------------------------------
// Puntaje (feedback del cliente, 2026-11-03, sección 3)
// ---------------------------------------------------------------------------------------

export interface ScoreBreakdown {
  /** true = jefe derrotado: puntaje final con HPie y multiplicador. */
  readonly final: boolean;
  /** Expedición de la que salen los valores. */
  readonly run: number;
  /** Puntos de cadena del run (10 + 20 + 30…). */
  readonly hunt: number;
  readonly questKills: number;
  readonly questTrophies: number;
  readonly hp: number;
  /** Puntos de las cartas de puntos (Piebix Cube, Varied Samples, Well Traveled). */
  readonly cards: number;
  readonly multiplier: number;
  readonly total: number;
}

function distinct<T>(list: readonly T[]): number {
  return new Set(list).size;
}

/** Trofeos sin gastar que coinciden con la misión secreta. */
export function questTrophiesHeld(state: GameState, data: GameData): number {
  if (!state.secretQuest) return 0;
  const { symbols } = findSecretQuest(data, state.secretQuest);
  return state.trophies.filter((s) => symbols.includes(s)).length;
}

/** Cartas de puntos: un punto por color o tipo distinto (máximo 4), en la escala ×10. */
function cardPoints(state: GameState, data: GameData): number {
  const { pointsCard, pointsCardMax } = data.config.scoring;
  return ownedIds(state).reduce((sum, id) => {
    const { effect } = findAbility(data, id);
    if (effect.type !== 'points') return sum;
    const count =
      effect.by === 'specialDice'
        ? distinct(state.dice.filter((d) => (SPECIAL_DICE as readonly DieKind[]).includes(d)))
        : effect.by === 'trophyTypes'
          ? distinct(state.trophies)
          : distinct(state.defeatedTypes);
    return sum + Math.min(count, pointsCardMax) * pointsCard;
  }, 0);
}

/** Multiplicador del jefe: entre menos expediciones, mayor (se detiene en slowMultiplier). */
export function bossMultiplier(runs: number, config: GameConfig): number {
  const { bossMultiplier: steps, slowMultiplier } = config.scoring;
  return steps.find((s) => runs <= s.maxRuns)?.multiplier ?? slowMultiplier;
}

/**
 * Puntaje del run actual. Con el jefe derrotado es el puntaje final:
 *   floor((puntos de cadena + misión × 10 + trofeos de misión × 10 + HPie × 10) × multiplicador)
 * Si no, el de "partida sin terminar": sin HPie y sin multiplicador.
 */
export function scoreBreakdown(state: GameState, data: GameData): ScoreBreakdown {
  const { scoring } = data.config;
  const final = state.bossDefeated;
  const questTrophies = questTrophiesHeld(state, data);
  const cards = cardPoints(state, data);
  const hp = final ? state.hp : 0;
  const multiplier = final ? bossMultiplier(state.runs, data.config) : 1;
  const base =
    state.runHuntPoints +
    state.runQuestKills * scoring.questKill +
    questTrophies * scoring.questTrophy +
    hp * scoring.hp +
    cards;
  return {
    final,
    run: state.runs,
    hunt: state.runHuntPoints,
    questKills: state.runQuestKills,
    questTrophies,
    hp,
    cards,
    multiplier,
    total: Math.floor(base * multiplier),
  };
}

function runScoreOf(state: GameState, data: GameData): RunScore {
  const { run, hunt, questKills, questTrophies, cards, total } = scoreBreakdown(state, data);
  return { run, hunt, questKills, questTrophies, cards, total };
}

/**
 * Puntaje de la partida: con el jefe derrotado, el final; si no, el del mejor run. Un run a
 * medias cuenta como terminado: dejar de jugar también lo termina.
 */
export function finalScore(state: GameState, data: GameData): number {
  if (state.bossDefeated) return scoreBreakdown(state, data).total;
  const best = state.bestRun?.total ?? 0;
  return state.run ? Math.max(best, runScoreOf(state, data).total) : best;
}

/** Termina el run: se guarda si es el mejor. */
function closeRun(state: GameState, data: GameData): GameState {
  if (!state.run || state.bossDefeated) return state;
  const score = runScoreOf(state, data);
  const better = state.bestRun === null || score.total > state.bestRun.total;
  return { ...state, bestRun: better ? score : state.bestRun };
}

// ---------------------------------------------------------------------------------------
// Misiones del pueblo (feedback del cliente, 2026-11-03, sección 2.2)
// ---------------------------------------------------------------------------------------

/**
 * Baraja las misiones con una semilla derivada de la partida y pone las primeras en el
 * tablero: al menos una de aldeano y una del Huntmaster, para que haya objetos y destrezas.
 */
function dealQuests(
  data: GameData,
  seed: string,
): { quests: QuestSlot[]; deck: string[]; serial: number } {
  const rng = new SeededRng(`${seed}:quests`);
  const deck = sample(rng, data.quests, data.quests.length);
  const hand: TownQuest[] = [];
  for (const kind of ['villager', 'huntmaster'] as const) {
    const first = deck.find((q) => q.kind === kind);
    if (first) hand.push(first);
  }
  for (const q of deck) {
    if (hand.length >= data.config.town.questSlots) break;
    if (!hand.includes(q)) hand.push(q);
  }
  return {
    quests: hand.map((q, since) => ({ id: q.id, since })),
    deck: deck.filter((q) => !hand.includes(q)).map((q) => q.id),
    serial: hand.length,
  };
}

/** Pone una misión nueva del mazo en ese espacio del tablero (el mazo se rearma si se acaba). */
function replaceQuest(state: GameState, data: GameData, at: number): GameState {
  const board = state.quests.map((q) => q.id);
  const deck =
    state.questDeck.length > 0
      ? state.questDeck
      : data.quests.map((q) => q.id).filter((id) => !board.includes(id));
  const [next, ...rest] = deck;
  const quests = state.quests.filter((_, i) => i !== at);
  if (next !== undefined) quests.splice(at, 0, { id: next, since: state.questSerial });
  return { ...state, quests, questDeck: rest, questSerial: state.questSerial + 1 };
}

/** La misión más antigua del tablero: se retira al volver al pueblo. */
export function oldestQuest(state: GameState): string | null {
  const oldest = [...state.quests].sort((a, b) => a.since - b.since)[0];
  return oldest?.id ?? null;
}

/**
 * Cómo se pagaría la misión: índices de trofeos y corazones (HPie). La de aldeano se paga con
 * UNO de los que muestra (`option`); la del Huntmaster, con TODOS. Los corazones no pueden
 * dejar KO en el pueblo. null = no alcanza.
 */
export function questPayment(
  state: GameState,
  quest: TownQuest,
  option?: QuestCost,
): { readonly trophies: number[]; readonly hearts: number } | null {
  const costs =
    quest.kind === 'huntmaster'
      ? quest.cost
      : option !== undefined && quest.cost.includes(option)
        ? [option]
        : null;
  if (!costs) return null;
  const trophies: number[] = [];
  let hearts = 0;
  for (const cost of costs) {
    if (cost === 'heart') {
      hearts++;
      continue;
    }
    const i = state.trophies.findIndex((s, j) => s === cost && !trophies.includes(j));
    if (i < 0) return null;
    trophies.push(i);
  }
  if (hearts >= state.hp) return null;
  return { trophies, hearts };
}

/** Opciones con las que se puede pagar ahora (aldeano: cada una; Huntmaster: todas o nada). */
export function payableOptions(state: GameState, quest: TownQuest): QuestCost[] {
  if (quest.kind === 'huntmaster') return questPayment(state, quest) ? [...quest.cost] : [];
  return [...new Set(quest.cost)].filter((c) => questPayment(state, quest, c) !== null);
}

/** Cartas de ese tipo que aún se pueden robar (las que no se tienen). */
function buyable(state: GameState, data: GameData, kind: Ability['kind']): Ability[] {
  const owned = ownedIds(state);
  return data.abilities.filter((a) => a.kind === kind && !owned.includes(a.id));
}

// ---------------------------------------------------------------------------------------
// Jefe
// ---------------------------------------------------------------------------------------

/** Pieous Assassin: "Any type, Random symbols" (lista de monstruos); sus espacios cambian. */
function makeBoss(data: GameData, rng: SeededRng): Monster {
  const { boss } = data.config;
  const slots: Slot[] = Array.from({ length: boss.slots }, () => randomTrophy(rng));
  return {
    id: boss.id,
    name: boss.name,
    type: slots[0] as GameSymbol,
    slots,
    trophies: [],
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
 * columna y todos los de la última llevan al jefe (si el toggle `boss` está encendido). Los
 * tipos (y el monstruo oculto de cada nodo) son aleatorios y cambian en cada expedición.
 */
function makeMap(data: GameData, rng: SeededRng): GameMap {
  const { columns, minNodes, maxNodes } = data.config.map;
  const boss = data.config.features.boss === true;
  const sizes = Array.from({ length: columns }, () => rng.nextInt(minNodes, maxNodes));
  const id = (c: number, i: number) => `c${c}n${i}`;
  const nodes: MapNode[] = [];
  sizes.forEach((size, c) => {
    const nextSize = sizes[c + 1];
    for (let i = 0; i < size; i++) {
      const type = randomTrophy(rng);
      const ofType = data.monsters.filter((m) => m.type === type);
      const pool = ofType.length > 0 ? ofType : data.monsters;
      const monster = pool[rng.nextInt(0, pool.length - 1)] as Monster;
      const next = new Set<string>();
      if (nextSize === undefined) {
        if (boss) next.add(BOSS_NODE);
      } else {
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

/**
 * Nodos a los que se puede ir ahora: la primera columna al salir del pueblo, o los conectados
 * al nodo actual. Sin expedición activa (huida, KO, partida terminada), ninguno.
 */
export function reachableNodes(state: GameState): string[] {
  const { map, run } = state;
  if (!map || !run || !canHunt(run) || state.result !== null) return [];
  if (state.position === null) return map.nodes.filter((n) => n.column === 0).map((n) => n.id);
  if (state.position === BOSS_NODE) return [];
  return [...(map.nodes.find((n) => n.id === state.position)?.next ?? [])];
}

/** Monstruo oculto de un nodo del mapa (el jefe se arma al entrar a su nodo). */
export function nodeMonster(state: GameState, data: GameData, nodeId: string): Monster {
  const node = state.map?.nodes.find((n) => n.id === nodeId) ?? fail(`No hay nodo ${nodeId}`);
  return findMonster(data, node.monsterId);
}

/**
 * Cuenta regresiva de Pieland: cada expedición que termina sin derrotar al jefe descuenta una;
 * al agotarse, Pieland pierde 1 PV y empieza la siguiente (más corta). Si se acaban todas, se
 * repite la última.
 */
function countDown(pieland: Pieland, countdown: readonly number[]): Pieland {
  if (pieland.left > 1) return { ...pieland, left: pieland.left - 1 };
  const stage = pieland.stage + 1;
  const left = countdown[Math.min(stage, countdown.length - 1)] as number;
  return { hp: pieland.hp - 1, stage, left };
}

// ---------------------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------------------

/** Gana un trofeo: si no hay espacio, queda pendiente hasta decidir cuál conservar. */
function gainTrophy(state: GameState, data: GameData, symbol: GameSymbol): GameState {
  if (state.trophies.length < trophyCapacity(state, data)) {
    return { ...state, trophies: [...state.trophies, symbol] };
  }
  return { ...state, pendingTrophy: symbol };
}

/**
 * Empieza una partida con lo que indica el manual (p. 7): 4 dados estándar, 1 trofeo y
 * 1 objeto al azar. Primero se elige el color del cazador, que da su dado especial, y la
 * misión secreta (`start`); después la ronda arranca con la expedición, como en el juego de
 * mesa, y el pueblo llega al volver (revisión del equipo, 2026-10-25). La misión secreta y el
 * tablero salen de semillas derivadas, para no cambiar el resto de la secuencia aleatoria.
 */
export function newGame(data: GameData, seed: string): GameState {
  const { player, town, pieland } = data.config;
  const rng = new SeededRng(seed);
  const trophies = Array.from({ length: player.startingTrophies }, () => randomTrophy(rng));
  const catalog = data.abilities.filter((a) => a.kind === 'item');
  const items = sample(rng, catalog, player.startingItems).map((a) => ({ id: a.id, ready: true }));
  const secretOffer = sample(new SeededRng(`${seed}:secret`), data.secretQuests, 2).map(
    (q) => q.id,
  );
  const board = dealQuests(data, seed);
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
    townUsed: [],
    townVisits: 0,
    guided: false,
    offer: null,
    map: null,
    position: null,
    combat: null,
    pendingTrophy: null,
    secretOffer,
    secretQuest: null,
    quests: board.quests,
    questDeck: board.deck,
    questSerial: board.serial,
    completedQuests: [],
    chain: 0,
    runHuntPoints: 0,
    runQuestKills: 0,
    bestRun: null,
    bossDefeated: false,
    defeatedTypes: [],
    lives: data.config.lives,
    pieland: { hp: pieland.hp, stage: 0, left: pieland.countdown[0] as number },
    result: null,
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

export interface TownOptionState {
  /** En la partida guiada las opciones aparecen una a una con cada regreso al pueblo. */
  readonly unlocked: boolean;
  /** Ya se eligió en esta visita (se muestra en gris). */
  readonly used: boolean;
  /** Se puede elegir ahora mismo. */
  readonly available: boolean;
}

/** ¿Se puede cumplir ahora alguna misión de ese tipo del tablero? */
function canCompleteAny(state: GameState, data: GameData, kind: Ability['kind']): boolean {
  if (buyable(state, data, kind).length === 0) return false;
  return state.quests.some((slot) => {
    const quest = findQuest(data, slot.id);
    return QUEST_REWARD[quest.kind] === kind && payableOptions(state, quest).length > 0;
  });
}

/**
 * Estado de cada opción del pueblo (feedback del cliente, 2026-10-27): cada opción se usa
 * una vez por visita, y en la partida guiada se empieza con 2 opciones y se suma una más en
 * cada regreso, para que el Huntmaster no quite poder al jugador al principio.
 */
export function townOptions(state: GameState, data: GameData): Record<TownOption, TownOptionState> {
  const { town } = data.config;
  const open = state.guided
    ? town.guidedStartOptions + Math.max(0, state.townVisits - 1)
    : TOWN_OPTIONS.length;
  const free = state.phase === 'town' && state.townActions > 0 && state.offer === null;
  const entries = TOWN_OPTIONS.map((option, i): [TownOption, TownOptionState] => {
    const unlocked = i < open;
    const used = state.townUsed.includes(option);
    const possible = option === 'rest' || canCompleteAny(state, data, option);
    return [option, { unlocked, used, available: free && unlocked && !used && possible }];
  });
  return Object.fromEntries(entries) as Record<TownOption, TownOptionState>;
}

/**
 * Para salir hay que gastar las acciones de la visita (feedback del cliente, 2026-10-27),
 * salvo que ya no quede ninguna opción posible (por ejemplo, sin trofeos para pagar).
 */
export function canLeaveTown(state: GameState, data: GameData): boolean {
  if (state.offer) return false;
  if (state.townActions <= 0) return true;
  return !Object.values(townOptions(state, data)).some((o) => o.available);
}

function spendTownAction(state: GameState, data: GameData, option: TownOption): GameState {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  if (state.townActions <= 0) fail('No te quedan acciones en el pueblo');
  const status = townOptions(state, data)[option];
  if (!status.unlocked) fail('Esa opción aún no está disponible');
  if (status.used) fail('Ya elegiste esa opción en esta visita');
  return {
    ...state,
    townActions: state.townActions - 1,
    townUsed: [...state.townUsed, option],
  };
}

/** DESCANSAR (manual p. 14): sana por completo, recarga todos los objetos y gana un trofeo. */
function rest(state: GameState, data: GameData): GameState {
  const spent = spendTownAction(state, data, 'rest');
  const rng = new SeededRng(state.rngState);
  const trophy = randomTrophy(rng);
  return gainTrophy(
    {
      ...spent,
      rngState: rng.currentState,
      hp: state.maxHp,
      items: state.items.map((i) => ({ ...i, ready: true })),
    },
    data,
    trophy,
  );
}

/**
 * MISIONES (feedback del cliente, 2026-11-03): se entregan los trofeos/corazones que pide una
 * misión del tablero y se roban 3 cartas para quedarse con una (aldeano → objetos, Huntmaster
 * → destrezas). La misión se retira y otra toma su lugar de inmediato.
 */
function completeQuest(
  state: GameState,
  data: GameData,
  id: string,
  option: QuestCost | undefined,
): GameState {
  const at = state.quests.findIndex((q) => q.id === id);
  if (at < 0) fail(`La misión "${id}" no está en el tablero`);
  const quest = findQuest(data, id);
  const kind = QUEST_REWARD[quest.kind];
  const spent = spendTownAction(state, data, kind);
  const payment = questPayment(state, quest, option);
  if (!payment) fail('No tienes lo que pide esa misión');
  const candidates = buyable(state, data, kind);
  if (candidates.length === 0) fail('No quedan cartas de ese tipo');
  const rng = new SeededRng(state.rngState);
  const ids = sample(rng, candidates, data.config.town.offerSize).map((a) => a.id);
  return replaceQuest(
    {
      ...spent,
      rngState: rng.currentState,
      hp: state.hp - payment.hearts,
      trophies: state.trophies.filter((_, i) => !payment.trophies.includes(i)),
      completedQuests: [...state.completedQuests, id],
      offer: { kind, ids },
    },
    data,
    at,
  );
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

/**
 * Elige una de las cartas ofrecidas: es obligatorio quedarse con una (feedback del cliente,
 * 2026-10-27). Máximo 3 de cada tipo.
 */
function pick(
  state: GameState,
  data: GameData,
  abilityId: string,
  replace: string | undefined,
): GameState {
  const { offer } = state;
  if (!offer) fail('No hay cartas para elegir');
  if (typeof abilityId !== 'string' || !offer.ids.includes(abilityId))
    fail(`"${abilityId}" no está entre las cartas ofrecidas`);
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

/** Cloning Tool: fuera de combate, recarga otro objeto gastado. No gasta acción del pueblo. */
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

/**
 * Salir del pueblo: empieza la expedición con todos los dados y el HPie que se tenga, y una
 * cadena de puntos nueva (runCount + 1).
 */
function leave(state: GameState, data: GameData): GameState {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  if (state.phase === 'town' && !canLeaveTown(state, data)) {
    fail('Usa tus acciones en el pueblo antes de salir');
  }
  const rng = new SeededRng(state.rngState);
  const map = makeMap(data, rng);
  return {
    ...state,
    rngState: rng.currentState,
    phase: 'trail',
    run: startRun({ dice: state.dice, maxHp: state.maxHp, hp: state.hp }),
    runs: state.runs + 1,
    chain: 0,
    runHuntPoints: 0,
    runQuestKills: 0,
    map,
    position: null,
  };
}

/**
 * Lleva el resultado del combate a la partida: dados, HPie, trofeos, objetos y puntaje. Cada
 * monstruo derrotado del run vale más que el anterior (10, 20, 30…); estudiar no cambia la
 * cadena y quedar KO no resta, pero cuesta una vida. Derrotar al jefe termina la partida; sin
 * vidas, termina al volver al pueblo.
 */
function settle(state: GameState, data: GameData, combat: CombatState): GameState {
  const run = endCombat(state.run as RunState, combat);
  const outcome = combat.outcome as Outcome;
  const { monster } = combat;
  const defeated = outcome === 'defeat';
  const boss = monster.boss === true;
  const chain = defeated ? state.chain + 1 : state.chain;
  const secret = state.secretQuest ? findSecretQuest(data, state.secretQuest) : null;
  const questKill = defeated && !boss && secret?.monsterType === monster.type;
  const lives = state.lives - (combat.ko ? 1 : 0);
  const next: GameState = {
    ...state,
    phase: defeated && boss ? 'over' : 'aftermath',
    combat,
    run,
    hp: run.hp,
    // Los trofeos colocados en el monstruo se gastaron
    trophies: combat.trophies,
    items: state.items.map((i) =>
      combat.usedAbilities.includes(i.id) ? { ...i, ready: false } : i,
    ),
    chain,
    runHuntPoints: state.runHuntPoints + (defeated ? chain * data.config.scoring.chainStep : 0),
    runQuestKills: state.runQuestKills + (questKill ? 1 : 0),
    bossDefeated: state.bossDefeated || (defeated && boss),
    lives,
    result: defeated && boss ? 'victory' : lives <= 0 ? 'lives' : state.result,
    defeatedTypes: defeated && !boss ? [...state.defeatedTypes, monster.type] : state.defeatedTypes,
    kos: state.kos + (combat.ko ? 1 : 0),
    fights: state.fights + 1,
    rerolls: state.rerolls + combat.rerolls,
    outcomes: { ...state.outcomes, [outcome]: (state.outcomes[outcome] ?? 0) + 1 },
  };
  return combat.trophy ? gainTrophy(next, data, combat.trophy) : next;
}

/** Empieza el combate contra ese monstruo con lo que queda de la expedición. */
function fight(state: GameState, data: GameData, monster: Monster, rng: SeededRng): GameState {
  const combat = startCombat(
    monster,
    {
      ...runCombatSetup(state.run as RunState),
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
    combat,
  };
  // Los blancos que quedaron en la reserva pueden dejarte KO al lanzar
  return combat.status === 'resolved' ? settle(next, data, combat) : next;
}

/**
 * Va al nodo elegido del mapa: el monstruo se revela y empieza el combate. El nodo final es la
 * guarida de Pieous Assassin (RF-16), con espacios aleatorios cada vez.
 */
function follow(state: GameState, data: GameData, nodeId: string): GameState {
  if (!reachableNodes(state).includes(nodeId)) fail(`No hay camino al nodo ${nodeId}`);
  const rng = new SeededRng(state.rngState);
  const monster = nodeId === BOSS_NODE ? makeBoss(data, rng) : nodeMonster(state, data, nodeId);
  return fight({ ...state, position: nodeId }, data, monster, rng);
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
  if (state.result !== null) fail('La partida terminó: vuelve al pueblo para ver el puntaje');
  if (!canHunt(run)) fail('La expedición terminó: vuelve al pueblo');
  if (reachableNodes(state).length === 0) fail('Llegaste al final del mapa: vuelve al pueblo');
  return { ...state, phase: 'trail', combat: null };
}

/**
 * Volver al pueblo termina el run (se guarda si fue el mejor). Se recuperan los dados y se
 * retiran los blancos. El HPie no se recupera solo: hay que descansar (D-21), salvo tras un
 * KO, que lo recupera todo (manual p. 11). La misión más antigua del tablero se retira y
 * llega una nueva (feedback del cliente, 2026-11-03). Aquí se decide el game over de V1: sin
 * vidas, o con Pieland en 0 tras su cuenta regresiva → puntaje.
 */
function goToTown(state: GameState, data: GameData): GameState {
  const closed = closeRun(state, data);
  if (state.result !== null) {
    return { ...closed, phase: 'over', run: null, combat: null, map: null, position: null };
  }
  const pieland = countDown(state.pieland, data.config.pieland.countdown);
  if (pieland.hp <= 0) {
    return {
      ...closed,
      phase: 'over',
      result: 'pieland',
      pieland,
      run: null,
      combat: null,
      map: null,
      position: null,
    };
  }
  const oldest = oldestQuest(closed);
  const rotated = oldest
    ? replaceQuest(
        closed,
        data,
        closed.quests.findIndex((q) => q.id === oldest),
      )
    : closed;
  return {
    ...rotated,
    phase: 'town',
    run: null,
    hp: state.run?.endedBy === 'ko' ? state.maxHp : state.hp,
    pieland,
    combat: null,
    map: null,
    position: null,
    townActions: data.config.town.actionsPerVisit,
    townUsed: [],
    townVisits: state.townVisits + 1,
  };
}

/** Dejar de jugar: el run a medias cuenta como terminado y queda el mejor puntaje. */
function finish(state: GameState, data: GameData): GameState {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  return {
    ...closeRun(state, data),
    phase: 'over',
    result: 'abandon',
    run: null,
    map: null,
    position: null,
  };
}

/**
 * Elige el color del cazador (su dado especial se suma a los dados) y la misión secreta, y
 * sale de expedición. En la primera partida la carta es la primera ofrecida; desde la
 * segunda se elige entre dos (feedback del cliente, 2026-11-03).
 */
function start(
  state: GameState,
  data: GameData,
  die: SpecialDieKind,
  guided: boolean,
  quest: string | undefined,
): GameState {
  if (!SPECIAL_DICE.includes(die)) fail(`"${die}" no es un dado especial`);
  const secretQuest = quest ?? state.secretOffer[0] ?? null;
  if (secretQuest !== null && !state.secretOffer.includes(secretQuest)) {
    fail(`"${secretQuest}" no es una de las misiones secretas ofrecidas`);
  }
  return leave({ ...state, guided, secretQuest, dice: [...state.dice, die] }, data);
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
      return start(state, data, action.die, action.guided === true, action.quest);
    case 'rest':
      requirePhase(state, 'town');
      return rest(state, data);
    case 'quest':
      requirePhase(state, 'town');
      return completeQuest(state, data, action.id, action.pay);
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
      requirePhase(state, 'town', 'trail', 'aftermath');
      return finish(state, data);
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
