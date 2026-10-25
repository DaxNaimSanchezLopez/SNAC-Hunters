import { z } from 'zod';
import type { Ability, DiceTable, Monster, SecretQuest } from './types.js';

// RF-08: Schemas Zod para los datos de config/

const GameSymbolSchema = z.enum(['Horn', 'Wing', 'Claw', 'Tail']);

// RF-08.4: SlotSchema — exactamente los valores válidos para Slot
const SlotSchema = z.enum(['Horn', 'Wing', 'Claw', 'Tail', 'all', 'damage']);

const FaceSchema = z.enum(['Horn', 'Wing', 'Claw', 'Tail', 'heart', 'wild', 'damage', 'blank']);

const DieKindSchema = z.enum(['red', 'orange', 'blue', 'purple', 'green', 'white']);

// RF-08: MonsterSchema — valida todos los campos de Monster
export const MonsterSchema = z.object({
  // RF-08.1: id no vacío
  id: z.string().min(1, 'El id del monstruo no puede estar vacío'),
  // RF-08.2: name no vacío
  name: z.string().min(1, 'El nombre del monstruo no puede estar vacío'),
  type: GameSymbolSchema,
  // RF-08.4: slots — exactamente 4 elementos válidos (D-02: z.tuple da tipo más preciso que z.array)
  slots: z.tuple([SlotSchema, SlotSchema, SlotSchema, SlotSchema]),
  trophies: z.array(GameSymbolSchema).min(1, 'El monstruo debe ofrecer al menos un trofeo'),
  pun: z.string(),
});

// RF-08.8: Tipo TypeScript inferido del schema — compatible con la interfaz Monster
export type MonsterFromSchema = z.infer<typeof MonsterSchema>;

// Cada dado tiene exactamente 6 caras
const DieFacesSchema = z.array(FaceSchema).length(6);

export const DiceTableSchema = z.object({
  red: DieFacesSchema,
  orange: DieFacesSchema,
  blue: DieFacesSchema,
  purple: DieFacesSchema,
  green: DieFacesSchema,
  white: DieFacesSchema,
});

// RF-14: Catálogo de habilidades — config/abilities.json
const SpecialDieSchema = z.enum(['orange', 'blue', 'purple', 'green']);

const AbilityEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('triple'), symbol: GameSymbolSchema }),
  z.object({ type: z.literal('double'), symbol: GameSymbolSchema }),
  z.object({ type: z.literal('wild'), symbol: GameSymbolSchema }),
  z.object({ type: z.literal('convert'), symbol: GameSymbolSchema }),
  z.object({ type: z.literal('special'), die: SpecialDieSchema }),
  // V1: resto de las cartas
  z.object({ type: z.literal('lucky'), die: SpecialDieSchema }),
  z.object({ type: z.literal('gauntlet') }),
  z.object({ type: z.literal('recharge') }),
  z.object({ type: z.literal('shield') }),
  z.object({
    type: z.literal('points'),
    by: z.enum(['specialDice', 'trophyTypes', 'monsterTypes']),
  }),
]);

export const AbilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['item', 'skill']),
  effect: AbilityEffectSchema,
  bonus: z.literal('trophySlot').optional(),
});

const count = z.number().int().min(0);

// Valores de jugador, reglas de V0 y feature toggles — config/game.json
export const GameConfigSchema = z
  .object({
    player: z.object({
      maxHp: z.number().int().min(1),
      startingHp: z.number().int().min(1),
      startingDice: z.array(DieKindSchema).min(1),
      // Manual p. 7: dos espacios para trofeos, un trofeo al azar y un objeto inicial
      trophySlots: count,
      startingTrophies: count,
      startingItems: count,
    }),
    // V1 (roguelite): vidas, Pieland amenazada, mapa FTL y jefe (feedback, secciones 7–9)
    lives: z.number().int().min(1),
    pieland: z.object({
      hp: z.number().int().min(1),
      // Expediciones sin vencer al jefe antes de que Pieland pierda 1 PV; la última se repite
      countdown: z.array(z.number().int().min(1)).min(1),
    }),
    map: z
      .object({
        columns: z.number().int().min(1),
        minNodes: z.number().int().min(1),
        maxNodes: z.number().int().min(1),
      })
      .refine((m) => m.minNodes <= m.maxNodes, { message: 'minNodes no puede superar maxNodes' }),
    boss: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      pun: z.string(),
      slots: z.number().int().min(1),
    }),
    // Fase en el pueblo (manual p. 14–16): acciones por visita y precios en trofeos
    town: z.object({
      actionsPerVisit: z.number().int().min(1),
      itemCost: count,
      skillCost: count,
      offerSize: z.number().int().min(1),
      maxItems: z.number().int().min(1),
      maxSkills: z.number().int().min(1),
    }),
    tutorial: z.object({
      monsterId: z.string().min(1),
      seed: z.string().min(1),
    }),
    features: z.record(z.string(), z.boolean()),
    // Puntos por resultado (cada monstruo derrotado vale 1, cada KO -1 según el reglamento)
    scoring: z.object({
      defeat: z.number().int(),
      study: z.number().int(),
      flee: z.number().int(),
      ko: z.number().int(),
      // Puntaje final (feedback V0): puntos − KOs × koWeight − expediciones × runWeight
      koWeight: z.number().int(),
      runWeight: z.number().int(),
      // V1: bonus por derrotar al jefe y máximo de las cartas de puntos
      victoryBonus: z.number().int(),
      pointsCardMax: z.number().int().min(0),
    }),
  })
  .refine((c) => c.player.startingHp <= c.player.maxHp, {
    message: 'startingHp no puede superar maxHp',
    path: ['player', 'startingHp'],
  })
  .refine((c) => !c.player.startingDice.includes('white'), {
    message: 'Los dados blancos no salen del pueblo',
    path: ['player', 'startingDice'],
  });

export type GameConfig = z.infer<typeof GameConfigSchema>;

// Pasos del tutorial interactivo — config/tutorial.json (textos fuera del código)
export const TutorialSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      // Selector español / inglés (feedback V0): cada paso trae ambos textos
      es: z.object({ title: z.string().min(1), text: z.string().min(1) }),
      en: z.object({ title: z.string().min(1), text: z.string().min(1) }),
      highlight: z.enum(['monster', 'dice', 'hp', 'reroll', 'resolve', 'trophies']).optional(),
      // Qué acción del jugador avanza el paso
      advance: z.enum(['next', 'assign', 'reroll', 'resolve']),
    }),
  )
  .min(1);

export type TutorialStep = z.infer<typeof TutorialSchema>[number];

// RF-17: Cartas de misión secreta — config/quests.json
export const SecretQuestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  monsterType: GameSymbolSchema,
  symbols: z.tuple([GameSymbolSchema, GameSymbolSchema]),
});

const LocalizedText = z.object({ title: z.string().min(1), text: z.string().min(1) });

// Partida guiada (V0 = tutorial del juego de mesa) — config/guide.json. Cada lección aparece
// una vez, cuando la partida está en la fase indicada y se cumplen sus condiciones.
export const GuideSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      phase: z.enum(['town', 'trail', 'combat', 'aftermath']),
      when: z
        .array(
          z.enum([
            'firstVisit',
            'returnVisit',
            'offer',
            'damageSlot',
            'hasTrophies',
            'hasAbilities',
            'whiteDie',
            'covered',
            'runActive',
            'runEnded',
            'boss',
          ]),
        )
        .default([]),
      // 'next' = botón "Entendido"; si no, la lección se cumple al hacer esa acción
      advance: z.enum(['next', 'leave', 'follow', 'assign', 'reroll', 'resolve']),
      highlight: z
        .enum([
          'hud',
          'dice',
          'trophies',
          'cards',
          'actions',
          'leave',
          'tracks',
          'monster',
          'abilities',
          'reroll',
          'resolve',
          'status',
          'map',
          'threat',
          'quest',
        ])
        .optional(),
      position: z.enum(['top', 'bottom']).default('bottom'),
      /** La última lección: al cerrarla termina la guía. */
      final: z.boolean().default(false),
      es: LocalizedText,
      en: LocalizedText,
    }),
  )
  .min(1)
  .refine((g) => new Set(g.map((l) => l.id)).size === g.length, {
    message: 'Ids de lección repetidos',
  });

export type GuideLesson = z.infer<typeof GuideSchema>[number];

// Verificación de compatibilidad de tipos en tiempo de compilación (RF-08.8, RF-07.7)
const _monsterCheck: MonsterFromSchema extends Monster ? true : false = true;
const _diceCheck: z.infer<typeof DiceTableSchema> extends DiceTable ? true : false = true;
const _abilityCheck: z.infer<typeof AbilitySchema> extends Ability ? true : false = true;
const _questCheck: z.infer<typeof SecretQuestSchema> extends SecretQuest ? true : false = true;
void _questCheck;
void _monsterCheck;
void _diceCheck;
void _abilityCheck;
