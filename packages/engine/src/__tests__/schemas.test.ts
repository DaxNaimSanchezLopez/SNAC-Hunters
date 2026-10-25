// RF-10.1, RF-10.2, RF-10.3: Tests unitarios y de propiedades para los schemas de config/
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { DiceTableSchema, GameConfigSchema, MonsterSchema } from '../schemas.js';
import type { Slot } from '../types.js';
import {
  DICE,
  GARDEN_SALAAD,
  PORCUPINEAPPLE,
  VALID_SLOTS,
  validMonsterArbitrary,
} from './fixtures.js';

describe('MonsterSchema Unit Tests', () => {
  // RF-10.1: Acepta un objeto Monster válido
  it('RF-10.1: acepta monstruos reales de Sherbert Forest', () => {
    for (const m of [GARDEN_SALAAD, PORCUPINEAPPLE]) {
      const result = MonsterSchema.safeParse(m);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual(m);
    }
  });

  // RF-10.2: Rechaza objetos con slots inválidos
  it('RF-10.2: rechaza un slot de símbolo desconocido', () => {
    const bad = { ...GARDEN_SALAAD, slots: ['Horn', 'Wing', 'Claw', 'UnknownSymbol'] };
    expect(MonsterSchema.safeParse(bad).success).toBe(false);
  });

  it('RF-10.2: rechaza menos o más de 4 slots', () => {
    expect(
      MonsterSchema.safeParse({ ...GARDEN_SALAAD, slots: ['Horn', 'Wing', 'Claw'] }).success,
    ).toBe(false);
    expect(
      MonsterSchema.safeParse({ ...GARDEN_SALAAD, slots: ['Horn', 'Wing', 'Claw', 'Tail', 'Tail'] })
        .success,
    ).toBe(false);
  });

  it('rechaza un tipo de monstruo que no es símbolo', () => {
    expect(MonsterSchema.safeParse({ ...GARDEN_SALAAD, type: 'all' }).success).toBe(false);
  });

  it('rechaza un monstruo sin opciones de trofeo', () => {
    expect(MonsterSchema.safeParse({ ...GARDEN_SALAAD, trophies: [] }).success).toBe(false);
  });
});

describe('DiceTableSchema / GameConfigSchema', () => {
  it('acepta la tabla de dados del Dice-guide', () => {
    expect(DiceTableSchema.safeParse(DICE).success).toBe(true);
  });

  it('rechaza un dado que no tiene 6 caras o con cara desconocida', () => {
    expect(DiceTableSchema.safeParse({ ...DICE, red: ['Horn'] }).success).toBe(false);
    expect(
      DiceTableSchema.safeParse({ ...DICE, white: ['x', 'x', 'x', 'x', 'x', 'x'] }).success,
    ).toBe(false);
  });

  const config = {
    player: {
      maxHp: 4,
      startingHp: 4,
      startingDice: ['red', 'green'],
      trophySlots: 2,
      startingTrophies: 1,
      startingItems: 1,
    },
    lives: 3,
    pieland: { hp: 5, countdown: [6, 5, 4, 3, 2] },
    map: { columns: 4, minNodes: 2, maxNodes: 3 },
    boss: { id: 'pieous', name: 'Pieous Assassin', pun: '', slots: 6 },
    town: {
      actionsPerVisit: 2,
      itemCost: 1,
      skillCost: 2,
      offerSize: 3,
      maxItems: 3,
      maxSkills: 3,
    },
    tutorial: { monsterId: 'garden-salaad', seed: 'seed' },
    features: { town: false },
    scoring: {
      defeat: 1,
      study: 0,
      flee: 0,
      ko: -1,
      koWeight: 3,
      runWeight: 1,
      victoryBonus: 5,
      pointsCardMax: 4,
    },
  };

  it('acepta una configuración válida', () => {
    expect(GameConfigSchema.safeParse(config).success).toBe(true);
  });

  it('rechaza startingHp mayor que maxHp', () => {
    const bad = { ...config, player: { ...config.player, startingHp: 7 } };
    expect(GameConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('rechaza dados blancos iniciales y reglas del pueblo incompletas', () => {
    const white = { ...config, player: { ...config.player, startingDice: ['red', 'white'] } };
    expect(GameConfigSchema.safeParse(white).success).toBe(false);
    const noTown = { ...config, town: { actionsPerVisit: 0 } };
    expect(GameConfigSchema.safeParse(noTown).success).toBe(false);
    const badMap = { ...config, map: { columns: 4, minNodes: 3, maxNodes: 2 } };
    expect(GameConfigSchema.safeParse(badMap).success).toBe(false);
  });
});

describe('MonsterSchema Property Tests', () => {
  // Property 1 y 2: id y name no vacíos — Validates: RF-08.1, RF-08.2
  it('Property 1-2: rechaza id/name vacíos y acepta cualquier valor no vacío', () => {
    fc.assert(
      fc.property(validMonsterArbitrary, (monster) => {
        expect(MonsterSchema.safeParse(monster).success).toBe(true);
        expect(MonsterSchema.safeParse({ ...monster, id: '' }).success).toBe(false);
        expect(MonsterSchema.safeParse({ ...monster, name: '' }).success).toBe(false);
      }),
    );
  });

  // Property 4: slots exactamente 4 elementos válidos — Validates: RF-08.4, RF-08.5, RF-08.6
  it('Property 4: valida slots como exactamente 4 elementos Slot válidos', () => {
    const invalidSlotArb = fc.string().filter((s) => !VALID_SLOTS.includes(s as Slot));

    fc.assert(
      fc.property(
        validMonsterArbitrary,
        fc.array(fc.constantFrom<Slot>(...VALID_SLOTS)).filter((arr) => arr.length !== 4),
        fc.integer({ min: 0, max: 3 }),
        invalidSlotArb,
        (monster, wrongLengthSlots, badIndex, badSlot) => {
          expect(MonsterSchema.safeParse({ ...monster, slots: wrongLengthSlots }).success).toBe(
            false,
          );
          const corrupted = [...monster.slots];
          corrupted[badIndex] = badSlot as Slot;
          expect(MonsterSchema.safeParse({ ...monster, slots: corrupted }).success).toBe(false);
        },
      ),
    );
  });
});
