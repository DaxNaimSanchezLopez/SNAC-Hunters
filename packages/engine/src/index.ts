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
  PointsBy,
  SecretQuest,
  TownQuest,
  QuestCost,
} from './types.js';

// RF-08: Schemas Zod de config/
export {
  MonsterSchema,
  DiceTableSchema,
  GameConfigSchema,
  TutorialSchema,
  AbilitySchema,
  GuideSchema,
  SecretQuestSchema,
  TownQuestSchema,
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
  loadSecretQuests,
  loadQuests,
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
  dieActivates,
  isActive,
  isWhiteWild,
  canReroll,
  SYMBOL_COLOR,
  pendingDamage,
  pendingHits,
  isRollable,
  isValidHp,
  canRerollAny,
  canActivate,
  canUndo,
  autoFillPlan,
  ABILITY_INPUTS,
  pickEncounterPair,
  CombatError,
} from './combat.js';
export type {
  Block,
  CombatState,
  CombatAction,
  CombatEvent,
  CombatSetup,
  Outcome,
  ActiveEffect,
} from './combat.js';

// RF-12: Expedición (run)
export {
  startRun,
  canHunt,
  hasHuntingDice,
  runCombatSetup,
  remainingPool,
  endCombat,
  returnToTown,
  replayRun,
} from './run.js';
export type { RunState, RunSetup, RunFight, RunEnd } from './run.js';

// RF-15: Partida (pueblo, expediciones, trofeos, habilidades, misiones, jefe y puntaje)
export {
  newGame,
  applyGameAction,
  replayGame,
  finalScore,
  scoreBreakdown,
  bossMultiplier,
  questTrophiesHeld,
  trophyCapacity,
  readyAbilities,
  findAbility,
  findQuest,
  findSecretQuest,
  questPayment,
  payableOptions,
  oldestQuest,
  bossAvailable,
  townOptions,
  canLeaveTown,
} from './game.js';
export type {
  GameData,
  GameState,
  GameAction,
  GamePhase,
  OwnedItem,
  QuestSlot,
  RunScore,
  ScoreBreakdown,
  TownOption,
  TownOptionState,
} from './game.js';
