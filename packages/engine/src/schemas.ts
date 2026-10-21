import { z } from 'zod';
import type { DiceTable, Monster } from './types.js';

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

// Valores de jugador y feature toggles — config/game.json
export const GameConfigSchema = z
  .object({
    player: z.object({
      maxHp: z.number().int().min(1),
      startingHp: z.number().int().min(1),
      startingDice: z.array(DieKindSchema).min(1),
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
    }),
  })
  .refine((c) => c.player.startingHp <= c.player.maxHp, {
    message: 'startingHp no puede superar maxHp',
    path: ['player', 'startingHp'],
  });

export type GameConfig = z.infer<typeof GameConfigSchema>;

// Pasos del tutorial interactivo — config/tutorial.json (textos fuera del código)
export const TutorialSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      text: z.string().min(1),
      highlight: z.enum(['monster', 'dice', 'hp', 'reroll', 'resolve']).optional(),
      // Qué acción del jugador avanza el paso
      advance: z.enum(['next', 'assign', 'reroll', 'resolve']),
    }),
  )
  .min(1);

export type TutorialStep = z.infer<typeof TutorialSchema>[number];

// Verificación de compatibilidad de tipos en tiempo de compilación (RF-08.8, RF-07.7)
const _monsterCheck: MonsterFromSchema extends Monster ? true : false = true;
const _diceCheck: z.infer<typeof DiceTableSchema> extends DiceTable ? true : false = true;
void _monsterCheck;
void _diceCheck;
