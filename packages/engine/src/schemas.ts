import { z } from 'zod';
import type { Monster } from './types.js';

// RF-08: Schema Zod para Monster

// RF-08.4: SlotSchema — exactamente los valores válidos para Slot
const SlotSchema = z.enum(['Horn', 'Wing', 'Claw', 'Tail', 'all']);

// RF-08: MonsterSchema — valida todos los campos de Monster
export const MonsterSchema = z.object({
  // RF-08.1: id no vacío
  id: z.string().min(1, 'El id del monstruo no puede estar vacío'),
  // RF-08.2: name no vacío
  name: z.string().min(1, 'El nombre del monstruo no puede estar vacío'),
  // RF-08.3: hp entero >= 1
  hp: z.number().int('El HP debe ser un entero').min(1, 'El HP del monstruo debe ser >= 1'),
  // RF-08.4: slots — exactamente 4 elementos válidos (D-02: z.tuple da tipo más preciso que z.array)
  slots: z.tuple([SlotSchema, SlotSchema, SlotSchema, SlotSchema]),
});

// RF-08.8: Tipo TypeScript inferido del schema — compatible con la interfaz Monster
export type MonsterFromSchema = z.infer<typeof MonsterSchema>;

// Verificación de compatibilidad de tipos en tiempo de compilación (RF-08.8, RF-07.7)
// Garantiza que MonsterFromSchema sea asignable a Monster
const _typeCheck: MonsterFromSchema extends Monster ? true : false = true;
void _typeCheck;
