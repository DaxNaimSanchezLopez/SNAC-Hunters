// RF-15: Partida — máquina de estados pura sobre todo el juego.
//   Color del cazador y misión secreta → expedición (mapa estilo FTL con monstruos ocultos y el
//   jefe al final) → combate → resultado → seguir por el mapa o volver al pueblo.
// Feedback final: Pieland con 8 corazones (pierde uno en cada regreso al pueblo), sin vidas, y un
// puntaje que se acumula durante toda la partida.
// Toda la aleatoriedad sale de la seed de la partida, así que el servidor re-simula
// seed + acciones con `replayGame` exactamente igual que el cliente (Regla de oro 2).

import { applyAction, CombatError, rechargeInCombat, startCombat, SYMBOL_COLOR } from './combat.js';
import type { CombatAction, CombatState, Outcome } from './combat.js';
import { canHunt, endCombat, runCombatSetup, startRun } from './run.js';
import type { RunState } from './run.js';
import { SeededRng } from './rng.js';
import type { GameConfig } from './schemas.js';
import type {
  Ability,
  DiceTable,
  DieKind,
  Face,
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

/** Cómo terminó la partida: limpió Sherbert Forest, cayó Pieland o la dejó. */
export type GameResult = 'victory' | 'pieland' | 'abandon';

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

/**
 * Pieland bajo ataque (feedback final): empieza con 8 corazones y pierde 1 cada vez que el
 * cazador vuelve al pueblo, por decisión propia o por KO. En 0 termina la partida.
 */
export interface Pieland {
  readonly hp: number;
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

/** Puntos ya guardados, por origen (para la pantalla final). */
export interface ScorePoints {
  /** Cadenas guardadas, más los 10 por SNAC que se conservan tras un KO. */
  readonly chain: number;
  /** SNACs del tipo de la misión secreta. */
  readonly secret: number;
  /** Misiones del pueblo cumplidas. */
  readonly quests: number;
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
  /** Más trofeos ganados sin espacio (saqueo): se deciden uno por uno tras el pendiente. */
  readonly overflow?: readonly GameSymbol[];
  /** Cartas de misión secreta para elegir al empezar (la primera partida solo usa la primera). */
  readonly secretOffer: readonly string[];
  readonly secretQuest: string | null;
  /** Tablero de misiones del pueblo (siempre 3) y mazo del que salen las nuevas. */
  readonly quests: readonly QuestSlot[];
  readonly questDeck: readonly string[];
  readonly questSerial: number;
  readonly completedQuests: readonly string[];
  /** Puntaje guardado de la partida (feedback final: se acumula durante toda la partida). */
  readonly score: number;
  readonly points: ScorePoints;
  /** SNACs derrotados en esta ronda: el siguiente vale (chain + 1) × 10. */
  readonly chain: number;
  readonly roundSnacs: number;
  /** Cadena en riesgo: se guarda al volver al pueblo o limpiar el bosque; con KO se pierde. */
  readonly pendingChain: number;
  /** Jefe derrotado = Sherbert Forest limpio. */
  readonly bossDefeated: boolean;
  /** Tipos de los monstruos derrotados en la partida (para Well Traveled). */
  readonly defeatedTypes: readonly GameSymbol[];
  readonly pieland: Pieland;
  /** Espacios para trofeos ganados en el alquimista (se suman a los del personaje). */
  readonly extraSlots: number;
  readonly result: GameResult | null;
  readonly kos: number;
  readonly runs: number;
  readonly fights: number;
  readonly rerolls: number;
  readonly outcomes: Readonly<Partial<Record<Outcome, number>>>;
}

/**
 * Opciones del pueblo: descansar, misión de aldeano (objeto) y del Huntmaster (destreza), y los
 * espacios del tablero del juego de mesa (feedback 2026-11-11): saqueo (+2 trofeos), alquimista
 * (2 de: +1 HPie, +1 trofeo, +1 espacio), entrenamiento (+1 dado rojo) y forja (dado rojo →
 * dado de color + trofeo). En la partida guiada se desbloquean en este orden.
 */
export type TownOption = 'rest' | Ability['kind'] | 'scavenge' | 'alchemist' | 'training' | 'forge';

export const TOWN_OPTIONS: readonly TownOption[] = [
  'rest',
  'item',
  'training',
  'alchemist',
  'skill',
  'scavenge',
  'forge',
];

/** Lo que se puede elegir en el alquimista (2 distintas). */
export type AlchemyPick = 'hp' | 'trophy' | 'slot';
const ALCHEMY: readonly AlchemyPick[] = ['hp', 'trophy', 'slot'];

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
  | { readonly type: 'scavenge' }
  | { readonly type: 'alchemist'; readonly picks: readonly AlchemyPick[] }
  /** Entrenamiento: +1 dado rojo y recarga ese objeto gastado (por defecto, el primero). */
  | { readonly type: 'training'; readonly item?: string }
  | { readonly type: 'forge'; readonly die: SpecialDieKind }
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
  return data.config.player.trophySlots + bonus.length + (state.extraSlots ?? 0);
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
  /** true = Sherbert Forest limpio: se suman los bonos de corazones y de bosque limpio. */
  readonly cleared: boolean;
  readonly chain: number;
  readonly secret: number;
  readonly quests: number;
  /** Puntos de las cartas de puntos (Piebix Cube, Varied Samples, Well Traveled). */
  readonly cards: number;
  /** Corazones que le quedan a Pieland y lo que valen (solo con el bosque limpio). */
  readonly hearts: number;
  readonly heartBonus: number;
  readonly clearedBonus: number;
  /** Cadena de la ronda en curso, todavía en riesgo (no cuenta en el total). */
  readonly atRisk: number;
  readonly total: number;
}

function distinct<T>(list: readonly T[]): number {
  return new Set(list).size;
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

/**
 * Puntaje (feedback final, sección 6): lo guardado (cadenas, misión secreta y misiones del
 * pueblo) más las cartas de puntos; si se limpió Sherbert Forest, + corazones de Pieland ×
 * HEART_BONUS + CLEARED_BONUS. La cadena de la ronda en curso no cuenta hasta guardarse.
 */
export function scoreBreakdown(state: GameState, data: GameData): ScoreBreakdown {
  const { scoring } = data.config;
  const cleared = state.bossDefeated;
  const cards = cardPoints(state, data);
  const hearts = cleared ? state.pieland.hp : 0;
  const heartBonus = hearts * scoring.heartBonus;
  const clearedBonus = cleared ? scoring.clearedBonus : 0;
  return {
    cleared,
    ...state.points,
    cards,
    hearts,
    heartBonus,
    clearedBonus,
    atRisk: state.pendingChain,
    total: state.score + cards + heartBonus + clearedBonus,
  };
}

/** Puntaje de la partida: lo guardado hasta ahora (y los bonos, si se limpió el bosque). */
export function finalScore(state: GameState, data: GameData): number {
  return scoreBreakdown(state, data).total;
}

/** Suma puntos guardados de un origen. */
function bank(state: GameState, key: keyof ScorePoints, amount: number): GameState {
  if (amount === 0) return state;
  return {
    ...state,
    score: state.score + amount,
    points: { ...state.points, [key]: state.points[key] + amount },
  };
}

/** Guarda la cadena en riesgo (al volver al pueblo o al limpiar el bosque). */
function bankChain(state: GameState): GameState {
  return { ...bank(state, 'chain', state.pendingChain), pendingChain: 0 };
}

// ---------------------------------------------------------------------------------------
// Misiones del pueblo (feedback del cliente, 2026-11-03, sección 2.2)
// ---------------------------------------------------------------------------------------

const QUEST_KINDS: readonly TownQuest['kind'][] = ['villager', 'huntmaster'];

function kindOf(data: GameData, id: string): TownQuest['kind'] {
  return findQuest(data, id).kind;
}

/**
 * Baraja las misiones con una semilla derivada de la partida y pone en el tablero
 * `town.questSlots` de cada tipo (feedback 2026-11-11: 3 de aldeano y 3 del Huntmaster).
 */
function dealQuests(
  data: GameData,
  seed: string,
): { quests: QuestSlot[]; deck: string[]; serial: number } {
  const rng = new SeededRng(`${seed}:quests`);
  const deck = sample(rng, data.quests, data.quests.length);
  const hand = QUEST_KINDS.flatMap((kind) =>
    deck.filter((q) => q.kind === kind).slice(0, data.config.town.questSlots),
  );
  return {
    quests: hand.map((q, since) => ({ id: q.id, since })),
    deck: deck.filter((q) => !hand.includes(q)).map((q) => q.id),
    serial: hand.length,
  };
}

/**
 * Pone una misión nueva del mazo, del mismo tipo, en ese espacio del tablero (si no quedan de
 * ese tipo, se rearman con las que no están en el tablero).
 */
function replaceQuest(state: GameState, data: GameData, at: number): GameState {
  const old = state.quests[at];
  if (!old) return state;
  const kind = kindOf(data, old.id);
  const board = state.quests.map((q) => q.id);
  let deck = state.questDeck;
  if (!deck.some((id) => kindOf(data, id) === kind)) {
    const refill = data.quests
      .filter((q) => q.kind === kind && !board.includes(q.id) && !deck.includes(q.id))
      .map((q) => q.id);
    deck = [...deck, ...refill];
  }
  const next = deck.find((id) => kindOf(data, id) === kind);
  const quests = state.quests.filter((_, i) => i !== at);
  if (next !== undefined) quests.splice(at, 0, { id: next, since: state.questSerial });
  return {
    ...state,
    quests,
    questDeck: deck.filter((id) => id !== next),
    questSerial: state.questSerial + 1,
  };
}

/** La misión más antigua de cada tipo: se retiran al volver al pueblo. */
export function oldestQuests(state: GameState, data: GameData): string[] {
  return QUEST_KINDS.flatMap((kind) => {
    const oldest = state.quests
      .filter((q) => kindOf(data, q.id) === kind)
      .sort((a, b) => a.since - b.since)[0];
    return oldest ? [oldest.id] : [];
  });
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
function makeMap(data: GameData, rng: SeededRng, first?: Monster): GameMap {
  const { columns, minNodes, maxNodes } = data.config.map;
  const boss = data.config.features.boss === true;
  const sizes = Array.from({ length: columns }, () => rng.nextInt(minNodes, maxNodes));
  const id = (c: number, i: number) => `c${c}n${i}`;
  const nodes: MapNode[] = [];
  sizes.forEach((size, c) => {
    const nextSize = sizes[c + 1];
    for (let i = 0; i < size; i++) {
      const rolledType = randomTrophy(rng);
      const ofType = data.monsters.filter((m) => m.type === rolledType);
      const pool = ofType.length > 0 ? ofType : data.monsters;
      const rolled = pool[rng.nextInt(0, pool.length - 1)] as Monster;
      // Partida guiada: la primera columna lleva al SNAC programado para enseñar
      const monster = first && c === 0 ? first : rolled;
      const type = monster.type;
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
    score: 0,
    points: { chain: 0, secret: 0, quests: 0 },
    chain: 0,
    roundSnacs: 0,
    pendingChain: 0,
    bossDefeated: false,
    defeatedTypes: [],
    pieland: { hp: pieland.hp },
    extraSlots: 0,
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

/** Visita al pueblo en la que se abre la opción en la partida guiada (1 = desde el inicio). */
export function unlockVisit(option: TownOption, data: GameData): number {
  return data.config.town.guidedUnlocks[option] ?? 1;
}

/**
 * Estado de cada opción del pueblo (feedback del cliente, 2026-10-27): cada opción se usa
 * una vez por visita. En la partida guiada se abren en orden (feedback final): al inicio
 * descansar, aldeano y entrenamiento; luego alquimista, Huntmaster, saqueo y herrería.
 */
export function townOptions(state: GameState, data: GameData): Record<TownOption, TownOptionState> {
  const free = state.phase === 'town' && state.townActions > 0 && state.offer === null;
  const entries = TOWN_OPTIONS.map((option): [TownOption, TownOptionState] => {
    const unlocked = !state.guided || state.townVisits >= unlockVisit(option, data);
    const used = state.townUsed.includes(option);
    const possible =
      option === 'item' || option === 'skill'
        ? canCompleteAny(state, data, option)
        : option === 'forge'
          ? state.dice.includes('red')
          : true;
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

/** Gana varios trofeos al azar, uno tras otro (el que no cabe queda pendiente de decidir). */
function gainRandomTrophies(state: GameState, data: GameData, n: number): GameState {
  const rng = new SeededRng(state.rngState);
  const symbols = Array.from({ length: n }, () => randomTrophy(rng));
  const next = { ...state, rngState: rng.currentState };
  // Sin espacio solo se puede dejar pendiente uno: el resto se ofrece al conservar (keep)
  return symbols.reduce((s, symbol) => {
    if (s.pendingTrophy !== null) return { ...s, overflow: [...(s.overflow ?? []), symbol] };
    return gainTrophy(s, data, symbol);
  }, next);
}

/** SAQUEO (tablero del juego de mesa): +2 trofeos al azar. */
function scavenge(state: GameState, data: GameData): GameState {
  return gainRandomTrophies(spendTownAction(state, data, 'scavenge'), data, 2);
}

/**
 * ALQUIMISTA (tablero, "Choose 2"): dos distintas de +1 HPie (sube el máximo y cura 1), +1 trofeo
 * al azar o +1 espacio para trofeos.
 */
function alchemist(state: GameState, data: GameData, picks: readonly AlchemyPick[]): GameState {
  if (
    !Array.isArray(picks) ||
    picks.length !== 2 ||
    new Set(picks).size !== 2 ||
    !picks.every((p) => ALCHEMY.includes(p))
  ) {
    fail('Elige 2 opciones distintas del alquimista');
  }
  let next = spendTownAction(state, data, 'alchemist');
  if (picks.includes('hp')) next = { ...next, maxHp: next.maxHp + 1, hp: next.hp + 1 };
  if (picks.includes('slot')) next = { ...next, extraSlots: next.extraSlots + 1 };
  if (picks.includes('trophy')) next = gainRandomTrophies(next, data, 1);
  return next;
}

/**
 * ENTRENAMIENTO (tablero; feedback final): +1 dado rojo para el resto de la partida y recarga un
 * objeto gastado (el elegido, o el primero si no se indica).
 */
function training(state: GameState, data: GameData, target: string | undefined): GameState {
  const spentItems = state.items.filter((i) => !i.ready).map((i) => i.id);
  if (target !== undefined && !spentItems.includes(target)) {
    fail(`No tienes un objeto gastado "${target}"`);
  }
  const next = spendTownAction(state, data, 'training');
  const refresh = target ?? spentItems[0];
  return {
    ...next,
    dice: [...next.dice, 'red'],
    items: next.items.map((i) => (i.id === refresh ? { ...i, ready: true } : i)),
  };
}

/** FORJA (tablero): un dado rojo se cambia por un dado especial del color elegido + 1 trofeo. */
function forge(state: GameState, data: GameData, die: SpecialDieKind): GameState {
  if (!SPECIAL_DICE.includes(die)) fail(`"${die}" no es un dado de color`);
  const at = state.dice.indexOf('red');
  if (at < 0) fail('No tienes un dado rojo para forjar');
  const next = spendTownAction(state, data, 'forge');
  return gainRandomTrophies(
    { ...next, dice: [...next.dice.filter((_, i) => i !== at), die] },
    data,
    1,
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
  // Feedback final: cada misión cumplida suma QUEST_POINTS
  const scored = bank(spent, 'quests', data.config.scoring.questPoints);
  return replaceQuest(
    {
      ...scored,
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
  const learned: GameState = {
    ...next,
    skills: [...next.skills, abilityId],
    dice: effect.type === 'special' ? [...next.dice, effect.die] : next.dice,
  };
  // Feedback 2026-11-11: las destrezas de dado especial dan también un trofeo de su color
  return effect.type === 'special' ? gainTrophy(learned, data, COLOR_SYMBOL[effect.die]) : learned;
}

const COLOR_SYMBOL = Object.fromEntries(
  Object.entries(SYMBOL_COLOR).map(([symbol, color]) => [color, symbol]),
) as Record<SpecialDieKind, GameSymbol>;

/** Objetos que el Cloning Tool puede recargar ahora: gastados, o usados con este monstruo. */
export function rechargeTargets(state: GameState, data: GameData): string[] {
  const tool = state.items.find(
    (i) => i.ready && findAbility(data, i.id).effect.type === 'recharge',
  );
  if (!tool) return [];
  const usedNow = state.phase === 'combat' ? (state.combat?.usedAbilities ?? []) : [];
  return state.items
    .filter((i) => i.id !== tool.id && (!i.ready || usedNow.includes(i.id)))
    .map((i) => i.id);
}

/**
 * Cloning Tool: recarga otro objeto gastado, en cualquier momento (feedback 2026-11-11), también
 * en combate: un objeto ya usado con este monstruo se puede volver a usar. No gasta acción.
 */
function recharge(state: GameState, data: GameData, target: string): GameState {
  const tool = state.items.find(
    (i) => i.ready && findAbility(data, i.id).effect.type === 'recharge',
  );
  if (!tool) fail('No tienes un objeto de recarga listo');
  const item = state.items.find((i) => i.id === target);
  if (!item || item.id === tool.id) fail(`No tienes otro objeto "${target}"`);
  if (!rechargeTargets(state, data).includes(target)) {
    fail(`${findAbility(data, target).name} ya está cargado`);
  }
  const items = state.items.map((i) =>
    i.id === tool.id ? { ...i, ready: false } : i.id === target ? { ...i, ready: true } : i,
  );
  if (state.phase !== 'combat' || !state.combat) return { ...state, items };
  return {
    ...state,
    items,
    combat: rechargeInCombat(state.combat, findAbility(data, target)),
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
  const guidedMonster = data.config.tutorial.guided?.monsterId;
  const first =
    state.guided && state.fights === 0 && guidedMonster
      ? findMonster(data, guidedMonster)
      : undefined;
  const map = makeMap(data, rng, first);
  return {
    ...state,
    rngState: rng.currentState,
    phase: 'trail',
    run: startRun({ dice: state.dice, maxHp: state.maxHp, hp: state.hp }),
    runs: state.runs + 1,
    chain: 0,
    roundSnacs: 0,
    pendingChain: 0,
    map,
    position: null,
  };
}

/**
 * Lleva el resultado del combate a la partida: dados, HPie, trofeos, objetos y puntaje
 * (feedback final). Cada SNAC derrotado en la ronda (también el jefe) suma a la cadena en
 * riesgo: 10, 20, 30… El de la misión secreta suma +10 de inmediato. Con KO se pierde la cadena
 * y solo quedan 10 por SNAC de la ronda. Derrotar al jefe limpia Sherbert Forest: la cadena se
 * guarda y la partida termina en ese momento.
 */
function settle(state: GameState, data: GameData, combat: CombatState): GameState {
  const { scoring } = data.config;
  const run = endCombat(state.run as RunState, combat);
  const outcome = combat.outcome as Outcome;
  const { monster } = combat;
  const defeated = outcome === 'defeat';
  const boss = monster.boss === true;
  const chain = defeated ? state.chain + 1 : state.chain;
  const roundSnacs = state.roundSnacs + (defeated ? 1 : 0);
  const secret = state.secretQuest ? findSecretQuest(data, state.secretQuest) : null;
  const secretKill = defeated && !boss && secret?.monsterType === monster.type;
  const cleared = defeated && boss;
  let next: GameState = {
    ...state,
    phase: cleared ? 'over' : 'aftermath',
    combat,
    run,
    hp: run.hp,
    // Los trofeos colocados en el monstruo se gastaron
    trophies: combat.trophies,
    items: state.items.map((i) =>
      combat.usedAbilities.includes(i.id) ? { ...i, ready: false } : i,
    ),
    chain,
    roundSnacs,
    pendingChain: state.pendingChain + (defeated ? chain * scoring.chainStep : 0),
    bossDefeated: state.bossDefeated || cleared,
    result: cleared ? 'victory' : state.result,
    defeatedTypes: defeated && !boss ? [...state.defeatedTypes, monster.type] : state.defeatedTypes,
    kos: state.kos + (combat.ko ? 1 : 0),
    fights: state.fights + 1,
    rerolls: state.rerolls + combat.rerolls,
    outcomes: { ...state.outcomes, [outcome]: (state.outcomes[outcome] ?? 0) + 1 },
  };
  if (secretKill) next = bank(next, 'secret', scoring.secretKill);
  if (combat.ko) {
    // KO: se pierde la cadena; solo quedan 10 puntos por SNAC derrotado en la ronda
    next = { ...bank(next, 'chain', roundSnacs * scoring.koSnac), pendingChain: 0 };
  } else if (cleared) {
    next = bankChain(next);
  }
  return combat.trophy ? gainTrophy(next, data, combat.trophy) : next;
}

/**
 * Primera tirada programada de la partida guiada (feedback final): solo coinciden 2 dados y
 * hay una flecha roja para enseñar a usar una habilidad. Depende del color del cazador.
 */
function guidedRoll(
  state: GameState,
  data: GameData,
  dice: readonly DieKind[],
): Face[] | undefined {
  const script = data.config.tutorial.guided;
  if (!state.guided || state.fights > 0 || !script) return undefined;
  const special = dice.find((d): d is SpecialDieKind =>
    (SPECIAL_DICE as readonly string[]).includes(d),
  );
  const roll = special ? script.roll[special] : undefined;
  return roll && roll.length === dice.length ? [...roll] : undefined;
}

/** Empieza el combate contra ese monstruo con lo que queda de la expedición. */
function fight(state: GameState, data: GameData, monster: Monster, rng: SeededRng): GameState {
  const setup = runCombatSetup(state.run as RunState);
  // Feedback final: desde el segundo SNAC de la partida siempre hay al menos un dado blanco,
  // aunque el cazador nunca relance
  const tired = state.fights + 1 >= data.config.player.whiteDieFromFight;
  const dice: DieKind[] =
    tired && !setup.dice.includes('white') ? [...setup.dice, 'white'] : [...setup.dice];
  const combat = startCombat(
    monster,
    {
      ...setup,
      dice,
      trophies: state.trophies,
      abilities: readyAbilities(state, data),
      faces: guidedRoll(state, data, dice),
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

function keep(state: GameState, data: GameData, discardIndex: number | null): GameState {
  const symbol = state.pendingTrophy;
  if (symbol === null) fail('No hay trofeo pendiente');
  let next: GameState;
  if (discardIndex === null) {
    next = { ...state, pendingTrophy: null };
  } else {
    if (!Number.isInteger(discardIndex) || state.trophies[discardIndex] === undefined) {
      fail(`No tienes el trofeo ${discardIndex}`);
    }
    next = {
      ...state,
      pendingTrophy: null,
      trophies: [...state.trophies.filter((_, i) => i !== discardIndex), symbol],
    };
  }
  const [queued, ...rest] = state.overflow ?? [];
  if (queued === undefined) return next;
  return gainTrophy({ ...next, overflow: rest }, data, queued);
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
 * Volver al pueblo termina la ronda (feedback final): se guarda la cadena (con KO ya se perdió)
 * y Pieland pierde un corazón; en 0, la partida termina. Se recuperan los dados y se retiran los
 * blancos. El HPie no se recupera solo: hay que descansar (D-21), salvo tras un KO, que recarga
 * el HPie y los objetos como descansar. La misión más antigua de cada casa se retira y llega una
 * nueva (feedback del cliente, 2026-11-03).
 */
function goToTown(state: GameState, data: GameData): GameState {
  const banked = bankChain(state);
  const pieland: Pieland = { hp: state.pieland.hp - 1 };
  const closed = { run: null, combat: null, map: null, position: null } as const;
  if (pieland.hp <= 0) {
    return { ...banked, ...closed, phase: 'over', result: 'pieland', pieland };
  }
  const rotated = oldestQuests(banked, data).reduce(
    (s, id) =>
      replaceQuest(
        s,
        data,
        s.quests.findIndex((q) => q.id === id),
      ),
    banked,
  );
  const ko = state.run?.endedBy === 'ko';
  return {
    ...rotated,
    ...closed,
    phase: 'town',
    hp: ko ? state.maxHp : state.hp,
    items: ko ? state.items.map((i) => ({ ...i, ready: true })) : state.items,
    pieland,
    townActions: data.config.town.actionsPerVisit,
    townUsed: [],
    townVisits: state.townVisits + 1,
  };
}

/** Dejar de jugar: queda lo que se guardó; la cadena en riesgo se pierde (feedback final). */
function finish(state: GameState): GameState {
  if (state.offer) fail('Primero elige una de las cartas ofrecidas');
  return {
    ...state,
    pendingChain: 0,
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
  // Partida guiada: el objeto inicial es el que enseña las habilidades (Auto-Aimer)
  const item = guided ? data.config.tutorial.guided?.item : undefined;
  const items = item ? [{ id: findAbility(data, item).id, ready: true }] : state.items;
  return leave({ ...state, guided, secretQuest, items, dice: [...state.dice, die] }, data);
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
      requirePhase(state, 'town', 'trail', 'combat', 'aftermath');
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
      return keep(state, data, action.discard);
    case 'scavenge':
      requirePhase(state, 'town');
      return scavenge(state, data);
    case 'alchemist':
      requirePhase(state, 'town');
      return alchemist(state, data, action.picks);
    case 'training':
      requirePhase(state, 'town');
      return training(state, data, action.item);
    case 'forge':
      requirePhase(state, 'town');
      return forge(state, data, action.die);
    case 'continue':
      requirePhase(state, 'aftermath');
      return next(state);
    case 'return':
      requirePhase(state, 'trail', 'aftermath');
      return goToTown(state, data);
    case 'finish':
      requirePhase(state, 'town', 'trail', 'aftermath');
      return finish(state);
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
