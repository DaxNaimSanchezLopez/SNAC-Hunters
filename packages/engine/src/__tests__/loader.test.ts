// RF-10.4, RF-10.5, RF-10.6: Tests unitarios y de propiedades para los loaders
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { loadDiceTable, loadGameConfig, loadMonsters, loadTutorial } from '../loader.js';
import type { Slot } from '../types.js';
import {
  DICE,
  GARDEN_SALAAD,
  PORCUPINEAPPLE,
  VALID_SLOTS,
  validMonsterArbitrary,
} from './fixtures.js';

const uniqueMonsters = (opts: { maxLength?: number } = {}) =>
  fc.uniqueArray(validMonsterArbitrary, { selector: (m) => m.id, ...opts });

describe('loadMonsters Unit Tests', () => {
  // RF-10.4: Devuelve el array correcto dado un JSON válido
  it('RF-10.4: carga monstruos válidos de Sherbert Forest', () => {
    const result = loadMonsters([GARDEN_SALAAD, PORCUPINEAPPLE]);
    expect(result).toEqual([GARDEN_SALAAD, PORCUPINEAPPLE]);
  });

  it('RF-10.4: devuelve array vacío si se pasa un array vacío', () => {
    expect(loadMonsters([])).toEqual([]);
  });

  // RF-10.5: Lanza un error dado un JSON con símbolos desconocidos
  it('RF-10.5: lanza un error con índice si un slot es desconocido', () => {
    const raw = [{ ...GARDEN_SALAAD, slots: ['Horn', 'Wing', 'Claw', 'InvalidSymbol'] }];
    expect(() => loadMonsters(raw)).toThrow(/índice 0/);
    expect(() => loadMonsters(raw)).toThrow(/inválido/);
  });

  // RF-10.6: Lanza un error dado un JSON con slots de longitud incorrecta
  it('RF-10.6: lanza un error si la longitud de slots es distinta de 4', () => {
    expect(() => loadMonsters([{ ...GARDEN_SALAAD, slots: ['Horn', 'Wing'] }])).toThrow(/índice 0/);
  });

  it('rechaza ids duplicados', () => {
    expect(() => loadMonsters([GARDEN_SALAAD, GARDEN_SALAAD])).toThrow(/duplicado/);
  });

  // RF-09.5: Lanza un error si el argumento no es un array
  it('RF-09.5: lanza un error descriptivo si el argumento no es un array', () => {
    for (const v of ['not an array', 123, { foo: 'bar' }, null, undefined]) {
      expect(() => loadMonsters(v)).toThrow(/se esperaba un array/);
    }
  });
});

describe('loadDiceTable / loadGameConfig', () => {
  it('devuelve la tabla válida', () => {
    expect(loadDiceTable(DICE)).toEqual(DICE);
  });

  it('lanza error descriptivo con tabla corrupta', () => {
    expect(() => loadDiceTable({ ...DICE, red: [] })).toThrow(/tabla de dados es inválido/);
  });

  it('valida los pasos del tutorial', () => {
    const steps = [{ id: 'a', title: 'T', text: 'x', advance: 'next' }];
    expect(loadTutorial(steps)).toEqual(steps);
    expect(() => loadTutorial([{ ...steps[0], advance: 'fly' }])).toThrow(/tutorial es inválido/);
    expect(() => loadTutorial([])).toThrow(/tutorial es inválido/);
  });

  it('lanza error descriptivo con configuración corrupta', () => {
    expect(() => loadGameConfig({ player: {} })).toThrow(/configuración es inválido/);
  });
});

describe('loadMonsters Property Tests', () => {
  // Property 5: round-trip — Validates: RF-09.1, RF-09.4
  it('Property 5: preserva los datos de cualquier array de monstruos válidos', () => {
    fc.assert(
      fc.property(uniqueMonsters(), (monsters) => {
        expect(loadMonsters(monsters)).toEqual(monsters);
      }),
    );
  });

  // Property 6: slot desconocido — Validates: RF-09.2
  it('Property 6: rechaza cualquier monstruo con slot desconocido e incluye el índice', () => {
    const invalidSlotArb = fc.string().filter((s) => !VALID_SLOTS.includes(s as Slot));
    fc.assert(
      fc.property(
        uniqueMonsters({ maxLength: 5 }),
        validMonsterArbitrary,
        fc.integer({ min: 0, max: 3 }),
        invalidSlotArb,
        (before, target, badIndex, badSlot) => {
          const slots = [...target.slots];
          slots[badIndex] = badSlot as Slot;
          const combined = [...before, { ...target, slots }];
          expect(() => loadMonsters(combined)).toThrow(new RegExp(`índice ${before.length}`));
        },
      ),
    );
  });

  // Property 7: no-array — Validates: RF-09.5
  it('Property 7: rechaza cualquier entrada que no sea un array', () => {
    const nonArray = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.double(),
      fc.boolean(),
      fc.dictionary(fc.string(), fc.anything()),
      fc.constant(null),
      fc.constant(undefined),
    );
    fc.assert(
      fc.property(nonArray, (v) => {
        expect(() => loadMonsters(v)).toThrow(/se esperaba un array/);
      }),
    );
  });
});
