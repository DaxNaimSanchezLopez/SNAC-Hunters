// RF-10.1, RF-10.2, RF-10.3: Tests unitarios y de propiedades para MonsterSchema
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MonsterSchema } from '../schemas.js';
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

describe('MonsterSchema Unit Tests', () => {
  // RF-10.1: Acepta un objeto Monster válido
  it('RF-10.1: acepta un objeto Monster válido de Sherbet Forest', () => {
    const validMonster = {
      id: 'snac-001',
      name: 'Frostbite Bunny',
      hp: 3,
      slots: ['Horn', 'Wing', 'Claw', 'Tail'] as const,
    };
    const result = MonsterSchema.safeParse(validMonster);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validMonster);
    }
  });

  // RF-10.2: Rechaza objetos con slots inválidos
  it('RF-10.2: rechaza un objeto con slot de símbolo desconocido', () => {
    const invalidMonster = {
      id: 'snac-001',
      name: 'Frostbite Bunny',
      hp: 3,
      slots: ['Horn', 'Wing', 'Claw', 'UnknownSymbol'],
    };
    const result = MonsterSchema.safeParse(invalidMonster);
    expect(result.success).toBe(false);
  });

  it('RF-10.2: rechaza un objeto con menos de 4 slots', () => {
    const invalidMonster = {
      id: 'snac-001',
      name: 'Frostbite Bunny',
      hp: 3,
      slots: ['Horn', 'Wing', 'Claw'],
    };
    const result = MonsterSchema.safeParse(invalidMonster);
    expect(result.success).toBe(false);
  });

  it('RF-10.2: rechaza un objeto con más de 4 slots', () => {
    const invalidMonster = {
      id: 'snac-001',
      name: 'Frostbite Bunny',
      hp: 3,
      slots: ['Horn', 'Wing', 'Claw', 'Tail', 'Tail'],
    };
    const result = MonsterSchema.safeParse(invalidMonster);
    expect(result.success).toBe(false);
  });

  // RF-10.3: Rechaza objetos con hp <= 0 o no entero
  it('RF-10.3: rechaza un objeto con hp = 0', () => {
    const invalidMonster = {
      id: 'snac-001',
      name: 'Frostbite Bunny',
      hp: 0,
      slots: ['Horn', 'Wing', 'Claw', 'Tail'],
    };
    const result = MonsterSchema.safeParse(invalidMonster);
    expect(result.success).toBe(false);
  });

  it('RF-10.3: rechaza un objeto con hp negativo', () => {
    const invalidMonster = {
      id: 'snac-001',
      name: 'Frostbite Bunny',
      hp: -5,
      slots: ['Horn', 'Wing', 'Claw', 'Tail'],
    };
    const result = MonsterSchema.safeParse(invalidMonster);
    expect(result.success).toBe(false);
  });

  it('RF-10.3: rechaza un objeto con hp con decimales', () => {
    const invalidMonster = {
      id: 'snac-001',
      name: 'Frostbite Bunny',
      hp: 2.5,
      slots: ['Horn', 'Wing', 'Claw', 'Tail'],
    };
    const result = MonsterSchema.safeParse(invalidMonster);
    expect(result.success).toBe(false);
  });
});

describe('MonsterSchema Property Tests', () => {
  // Property 1: MonsterSchema rechaza id vacío y acepta cualquier id no vacío
  // Validates: RF-08.1
  it('Property 1: MonsterSchema rechaza id vacío y acepta cualquier id no vacío', () => {
    fc.assert(
      fc.property(validMonsterArbitrary, (monster) => {
        // Id no vacío es aceptado
        const validResult = MonsterSchema.safeParse(monster);
        expect(validResult.success).toBe(true);

        // Id vacío es rechazado
        const invalidResult = MonsterSchema.safeParse({ ...monster, id: '' });
        expect(invalidResult.success).toBe(false);
      }),
    );
  });

  // Property 2: MonsterSchema rechaza name vacío y acepta cualquier name no vacío
  // Validates: RF-08.2
  it('Property 2: MonsterSchema rechaza name vacío y acepta cualquier name no vacío', () => {
    fc.assert(
      fc.property(validMonsterArbitrary, (monster) => {
        // Name no vacío es aceptado
        const validResult = MonsterSchema.safeParse(monster);
        expect(validResult.success).toBe(true);

        // Name vacío es rechazado
        const invalidResult = MonsterSchema.safeParse({ ...monster, name: '' });
        expect(invalidResult.success).toBe(false);
      }),
    );
  });

  // Property 3: MonsterSchema valida hp como entero positivo
  // Validates: RF-08.3, RF-08.7
  it('Property 3: MonsterSchema valida hp como entero positivo (>= 1 pasa, <= 0 y floats fallan)', () => {
    fc.assert(
      fc.property(
        validMonsterArbitrary,
        fc.integer({ max: 0 }),
        fc.integer({ min: 1, max: 10_000 }),
        (monster, nonPositiveHp, intForFloat) => {
          // hp >= 1 entero pasa
          const validResult = MonsterSchema.safeParse(monster);
          expect(validResult.success).toBe(true);

          // hp <= 0 falla
          const nonPositiveResult = MonsterSchema.safeParse({ ...monster, hp: nonPositiveHp });
          expect(nonPositiveResult.success).toBe(false);

          // float (no entero) falla
          const floatResult = MonsterSchema.safeParse({ ...monster, hp: intForFloat + 0.5 });
          expect(floatResult.success).toBe(false);
        },
      ),
    );
  });

  // Property 4: MonsterSchema valida slots como exactamente 4 elementos Slot válidos
  // Validates: RF-08.4, RF-08.5, RF-08.6
  it('Property 4: MonsterSchema valida slots como exactamente 4 elementos Slot válidos', () => {
    const invalidSlotArb = fc.string().filter((s) => !VALID_SLOTS.includes(s as Slot));

    fc.assert(
      fc.property(
        validMonsterArbitrary,
        fc.array(fc.constantFrom<Slot>(...VALID_SLOTS)).filter((arr) => arr.length !== 4),
        fc.integer({ min: 0, max: 3 }),
        invalidSlotArb,
        (monster, wrongLengthSlots, badIndex, badSlot) => {
          // Tupla válida de 4 slots pasa
          const validResult = MonsterSchema.safeParse(monster);
          expect(validResult.success).toBe(true);

          // Longitud != 4 falla
          const wrongLengthResult = MonsterSchema.safeParse({
            ...monster,
            slots: wrongLengthSlots,
          });
          expect(wrongLengthResult.success).toBe(false);

          // Al menos un slot desconocido falla
          const corruptedSlots = [...monster.slots];
          corruptedSlots[badIndex] = badSlot as Slot;
          const badSlotResult = MonsterSchema.safeParse({
            ...monster,
            slots: corruptedSlots,
          });
          expect(badSlotResult.success).toBe(false);
        },
      ),
    );
  });
});
