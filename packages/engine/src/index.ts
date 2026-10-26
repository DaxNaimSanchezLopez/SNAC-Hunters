// RF-07: Tipos del dominio
export type {
  GameSymbol,
  Slot,
  DieKind,
  DieSource,
  Face,
  DiceTable,
  Die,
  Trophy,
  Monster,
  Ability,
  AbilityEffect,
  SpecialDieKind,
} from './types.js';

// RF-08: Schemas Zod de config/
export {
  MonsterSchema,
  DiceTableSchema,
  GameConfigSchema,
  TutorialSchema,
  AbilitySchema,
  GuideSchema,
} from './schemas.js';
export type { MonsterFromSchema, GameConfig, TutorialStep, GuideLesson } from './schemas.js';

// RF-09: Loaders de config/
export {
  loadMonsters,
  loadDiceTable,
  loadGameConfig,
  loadTutorial,
  loadAbilities,
  loadGuide,
} from './loader.js';

// RNF-02: RNG determinista con semilla
export { SeededRng } from './rng.js';

// RF-11: Motor de combate
export {
  startCombat,
  applyAction,
  replayCombat,
  faceMatchesSlot,
  availableDice,
  coveredSlots,
  previewOutcome,
  validSlotsFor,
  slotsForFace,
  faceActivates,
  pendingDamage,
  isRollable,
  isValidHp,
  WHITE_DIE_DAMAGE,
  canRerollAny,
  ABILITY_INPUTS,
  pickEncounterPair,
  CombatError,
} from './combat.js';
export type { CombatState, CombatAction, CombatEvent, CombatSetup, Outcome } from './combat.js';

// RF-12: Expedición (run)
export {
  startRun,
  canHunt,
  runCombatSetup,
  remainingPool,
  endCombat,
  returnToTown,
  replayRun,
} from './run.js';
export type { RunState, RunSetup, RunFight, RunEnd } from './run.js';

// RF-15: Partida V0 (pueblo, expediciones, trofeos, habilidades, puntaje)
export {
  newGame,
  applyGameAction,
  replayGame,
  finalScore,
  trophyCapacity,
  readyAbilities,
  findAbility,
} from './game.js';
export type { GameData, GameState, GameAction, GamePhase, OwnedItem } from './game.js';
