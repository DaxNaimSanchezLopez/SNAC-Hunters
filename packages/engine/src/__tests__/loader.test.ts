// RF-10.4, RF-10.5, RF-10.6: Tests unitarios y de propiedades para loadMonsters
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { loadMonsters } from '../loader.js';
import type { Slot } from '../types.js';

const VALID_SLOTS: readonly Slot[] = ['Horn', 'Wing', 'Claw', 'Tail', 'all'] as const;

const validMonsterArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  hp: fc.integer({ min: 1, max: 1_000_000 }),
  slots: fc.tuple(
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
    fc.constantFrom<Slot>(...VALID_SLOTS),
  ),
});

describe('loadMonsters Unit Tests', () => {
  // RF-10.4: Devuelve el array correcto dado un JSON válido
  it('RF-10.4: carga array de monstruos válidos de Sherbet Forest correctamente', () => {
    const rawMonsters = [
      {
        id: 'snac-001',
        name: 'Frostbite Bunny',
        hp: 3,
        slots: ['Horn', 'Wing', 'Claw', 'Tail'],
      },
      {
        id: 'snac-002',
        name: 'Candy Creeper',
        hp: 2,
        slots: ['Horn', 'Horn', 'all', 'Tail'],
      },
    ];

    const result = loadMonsters(rawMonsters);
    expect(result).toEqual(rawMonsters);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Frostbite Bunny');
    expect(result[1].name).toBe('Candy Creeper');
  });

  it('RF-10.4: devuelve array vacío si se pasa un array vacío', () => {
    const result = loadMonsters([]);
    expect(result).toEqual([]);
  });

  // RF-10.5: Lanza un error dado un JSON con símbolos desconocidos
  it('RF-10.5: lanza un error si un monstruo contiene un slot con símbolo desconocido', () => {
    const rawMonsters = [
      {
        id: 'snac-001',
        name: 'Frostbite Bunny',
        hp: 3,
        slots: ['Horn', 'Wing', 'Claw', 'InvalidSymbol'],
      },
    ];

    expect(() => loadMonsters(rawMonsters)).toThrow(/índice 0/);
    expect(() => loadMonsters(rawMonsters)).toThrow(/inválido/);
  });

  // RF-10.6: Lanza un error dado un JSON con slots de longitud incorrecta
  it('RF-10.6: lanza un error si un monstruo tiene longitud de slots distinta de 4', () => {
    const rawMonsters = [
      {
        id: 'snac-001',
        name: 'Frostbite Bunny',
        hp: 3,
        slots: ['Horn', 'Wing'],
      },
    ];

    expect(() => loadMonsters(rawMonsters)).toThrow(/índice 0/);
  });

  // RF-09.5: Lanza un error si el argumento no es un array
  it('RF-09.5: lanza un error descriptivo si el argumento no es un array', () => {
    expect(() => loadMonsters('not an array')).toThrow(/se esperaba un array/);
    expect(() => loadMonsters(123)).toThrow(/se esperaba un array/);
    expect(() => loadMonsters({ foo: 'bar' })).toThrow(/se esperaba un array/);
    expect(() => loadMonsters(null)).toThrow(/se esperaba un array/);
    expect(() => loadMonsters(undefined)).toThrow(/se esperaba un array/);
  });

  it('RF-09.3: lanza un error si un monstruo tiene hp <= 0', () => {
    const rawMonsters = [
      {
        id: 'snac-001',
        name: 'Frostbite Bunny',
        hp: 0,
        slots: ['Horn', 'Wing', 'Claw', 'Tail'],
      },
    ];

    expect(() => loadMonsters(rawMonsters)).toThrow(/índice 0/);
  });
});

describe('loadMonsters Property Tests', () => {
  // Property 5: loadMonsters preserva datos en round-trip para entrada válida
  // Validates: RF-09.1, RF-09.4
  it('Property 5: loadMonsters preserva datos en round-trip para cualquier array de monstruos válidos', () => {
    fc.assert(
      fc.property(fc.array(validMonsterArbitrary), (monsters) => {
        const result = loadMonsters(monsters);
        expect(result).toEqual(monsters);
        expect(result.length).toBe(monsters.length);
        for (let i = 0; i < monsters.length; i++) {
          expect(result[i].id).toBe(monsters[i].id);
          expect(result[i].name).toBe(monsters[i].name);
          expect(result[i].hp).toBe(monsters[i].hp);
          expect(result[i].slots).toEqual(monsters[i].slots);
        }
      }),
    );
  });

  // Property 6: loadMonsters rechaza cualquier monstruo con slot desconocido
  // Validates: RF-09.2
  it('Property 6: loadMonsters rechaza cualquier monstruo con slot desconocido e incluye el índice en el error', () => {
    const invalidSlotArb = fc.string().filter((s) => !VALID_SLOTS.includes(s as Slot));

    fc.assert(
      fc.property(
        fc.array(validMonsterArbitrary, { maxLength: 5 }),
        fc.array(validMonsterArbitrary, { maxLength: 5 }),
        validMonsterArbitrary,
        fc.integer({ min: 0, max: 3 }),
        invalidSlotArb,
        (before, after, targetMonster, badSlotIndex, badSlot) => {
          const badSlots = [...targetMonster.slots];
          badSlots[badSlotIndex] = badSlot as Slot;
          const badMonster = { ...targetMonster, slots: badSlots };

          const combined = [...before, badMonster, ...after];
          const targetIndex = before.length;

          expect(() => loadMonsters(combined)).toThrow(
            new RegExp(`índice ${targetIndex}`),
          );
        },
      ),
    );
  });

  // Property 7: loadMonsters rechaza cualquier entrada que no sea un array
  // Validates: RF-09.5
  it('Property 7: loadMonsters rechaza cualquier entrada que no sea un array', () => {
    const nonArrayArbitrary = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.double(),
      fc.boolean(),
      fc.dictionary(fc.string(), fc.anything()),
      fc.constant(null),
      fc.constant(undefined),
    );

    fc.assert(
      fc.property(nonArrayArbitrary, (nonArray) => {
        expect(() => loadMonsters(nonArray)).toThrow(/se esperaba un array/);
      }),
    );
  });
});
