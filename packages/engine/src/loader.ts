import type { ZodType, ZodTypeDef } from 'zod';
import {
  AbilitySchema,
  DiceTableSchema,
  GameConfigSchema,
  GuideSchema,
  MonsterSchema,
  SecretQuestSchema,
  TutorialSchema,
} from './schemas.js';
import type { GameConfig, GuideLesson, TutorialStep } from './schemas.js';
import type { Ability, DiceTable, Monster, SecretQuest } from './types.js';

function formatIssues(issues: readonly { path: (string | number)[]; message: string }[]): string {
  return issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
}

function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, raw: unknown, label: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${label} es inválido:\n${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

/**
 * RF-09: Carga y valida un array de monstruos desde contenido JSON crudo.
 * D-04: La función es pura — no hace I/O. El caller es responsable de leer el JSON.
 *
 * @throws Error descriptivo si la entrada no es un array o contiene monstruos inválidos
 */
export function loadMonsters(raw: unknown): Monster[] {
  // RF-09.5: rechaza cualquier valor que no sea un array
  if (!Array.isArray(raw)) {
    throw new Error(`loadMonsters: se esperaba un array, se recibió ${typeof raw}`);
  }

  // RF-09.2, RF-09.3: valida cada elemento con MonsterSchema
  const monsters = raw.map((item, index) =>
    parseOrThrow(MonsterSchema, item, `loadMonsters: monstruo en índice ${index}`),
  );

  const ids = new Set<string>();
  for (const m of monsters) {
    if (ids.has(m.id)) throw new Error(`loadMonsters: id de monstruo duplicado "${m.id}"`);
    ids.add(m.id);
  }
  return monsters;
}

/** Valida la tabla de caras de dados (config/dice.json). */
export function loadDiceTable(raw: unknown): DiceTable {
  return parseOrThrow(DiceTableSchema, raw, 'loadDiceTable: tabla de dados');
}

/** Valida los pasos del tutorial (config/tutorial.json). */
export function loadTutorial(raw: unknown): TutorialStep[] {
  return parseOrThrow(TutorialSchema, raw, 'loadTutorial: tutorial');
}

/** Valida las lecciones de la partida guiada (config/guide.json). */
export function loadGuide(raw: unknown): GuideLesson[] {
  return parseOrThrow(GuideSchema, raw, 'loadGuide: guía');
}

/** Valida los valores del jugador y feature toggles (config/game.json). */
export function loadGameConfig(raw: unknown): GameConfig {
  return parseOrThrow(GameConfigSchema, raw, 'loadGameConfig: configuración');
}

/** RF-14: Valida el catálogo de habilidades (config/abilities.json); los ids deben ser únicos. */
export function loadAbilities(raw: unknown): Ability[] {
  if (!Array.isArray(raw)) {
    throw new Error(`loadAbilities: se esperaba un array, se recibió ${typeof raw}`);
  }
  const abilities = raw.map((item, index) =>
    parseOrThrow(AbilitySchema, item, `loadAbilities: habilidad en índice ${index}`),
  );
  const ids = new Set<string>();
  for (const a of abilities) {
    if (ids.has(a.id)) throw new Error(`loadAbilities: id de habilidad duplicado "${a.id}"`);
    ids.add(a.id);
  }
  return abilities;
}

/** RF-17: Valida las cartas de misión secreta (config/quests.json). */
export function loadQuests(raw: unknown): SecretQuest[] {
  if (!Array.isArray(raw)) {
    throw new Error(`loadQuests: se esperaba un array, se recibió ${typeof raw}`);
  }
  if (raw.length === 0) throw new Error('loadQuests: se necesita al menos una misión');
  return raw.map((item, index) =>
    parseOrThrow(SecretQuestSchema, item, `loadQuests: misión en índice ${index}`),
  );
}
