// RF-07: Tipos del dominio
export type { GameSymbol, Slot, DieKind, Face, DiceTable, Die, Trophy, Monster } from './types.js';

// RF-08: Schemas Zod de config/
export { MonsterSchema, DiceTableSchema, GameConfigSchema, TutorialSchema } from './schemas.js';
export type { MonsterFromSchema, GameConfig, TutorialStep } from './schemas.js';

// RF-09: Loaders de config/
export { loadMonsters, loadDiceTable, loadGameConfig, loadTutorial } from './loader.js';

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
  pickEncounterPair,
  CombatError,
} from './combat.js';
export type { CombatState, CombatAction, CombatEvent, CombatSetup, Outcome } from './combat.js';
