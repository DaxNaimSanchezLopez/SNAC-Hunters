// Datos de prueba compartidos. Copia de config/ para que los tests del engine no dependan de I/O.
import * as fc from 'fast-check';
import type { DiceTable, GameSymbol, Monster, Slot } from '../types.js';

export const SYMBOLS: readonly GameSymbol[] = ['Horn', 'Wing', 'Claw', 'Tail'];
export const VALID_SLOTS: readonly Slot[] = ['Horn', 'Wing', 'Claw', 'Tail', 'all', 'damage'];

export const DICE: DiceTable = {
  red: ['Claw', 'Horn', 'heart', 'Wing', 'Tail', 'heart'],
  orange: ['Horn', 'Horn', 'Horn', 'Horn', 'wild', 'wild'],
  blue: ['Wing', 'Wing', 'Wing', 'Wing', 'wild', 'wild'],
  purple: ['Tail', 'Tail', 'Tail', 'Tail', 'wild', 'wild'],
  green: ['Claw', 'Claw', 'Claw', 'Claw', 'wild', 'wild'],
  white: ['damage', 'damage', 'damage', 'blank', 'blank', 'wild'],
};

/** Tabla trucada: cada tipo de dado siempre saca la misma cara. Útil para casos límite. */
export function fixedTable(
  overrides: Partial<Record<keyof DiceTable, DiceTable['red'][number]>>,
): DiceTable {
  const table = { ...DICE } as Record<keyof DiceTable, DiceTable['red']>;
  for (const [kind, face] of Object.entries(overrides)) {
    table[kind as keyof DiceTable] = Array(6).fill(face);
  }
  return table;
}

export const GARDEN_SALAAD: Monster = {
  id: 'garden-salaad',
  name: 'Garden Salaad',
  type: 'Claw',
  slots: ['Claw', 'Claw', 'Horn', 'all'],
  trophies: ['Claw', 'Horn'],
  pun: 'You may want to leaf it alone',
};

export const PORCUPINEAPPLE: Monster = {
  id: 'porcupineapple',
  name: 'Porcupineapple',
  type: 'Claw',
  slots: ['Claw', 'Claw', 'Horn', 'damage'],
  trophies: ['Claw', 'Horn'],
  pun: 'Some real sour spines',
};

export const BEEHOLDER: Monster = {
  id: 'beeholder',
  name: 'Beeholder',
  type: 'Wing',
  slots: ['Wing', 'Wing', 'Horn', 'all'],
  trophies: ['Wing', 'Horn'],
  pun: 'Roll 2B4 damage',
};

export const validMonsterArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  type: fc.constantFrom<GameSymbol>(...SYMBOLS),
  slots: fc.tuple(
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
  ),
  trophies: fc.array(fc.constantFrom<GameSymbol>(...SYMBOLS), { minLength: 1, maxLength: 2 }),
  pun: fc.string(),
});
