// RF-11: Tests deterministas del motor de combate, incluyendo los casos límite del brief:
// comodines, dados blancos, daño y escudo simultáneos, KO.
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  applyAction,
  availableDice,
  CombatError,
  coveredSlots,
  faceMatchesSlot,
  pickEncounterPair,
  previewOutcome,
  replayCombat,
  startCombat,
  validSlotsFor,
} from '../combat.js';
import type { CombatAction, CombatSetup, CombatState } from '../combat.js';
import type { DieKind } from '../types.js';
import { BEEHOLDER, DICE, fixedTable, GARDEN_SALAAD, PORCUPINEAPPLE } from './fixtures.js';

const SETUP: CombatSetup = { dice: ['red', 'red', 'red', 'red', 'green'], hp: 6, maxHp: 6 };

function act(state: CombatState, action: CombatAction, table = DICE): CombatState {
  return applyAction(state, action, table);
}

describe('faceMatchesSlot', () => {
  it('un símbolo cubre su propio slot y el slot "all"', () => {
    expect(faceMatchesSlot('Claw', 'Claw')).toBe(true);
    expect(faceMatchesSlot('Claw', 'all')).toBe(true);
    expect(faceMatchesSlot('Claw', 'Horn')).toBe(false);
  });

  it('el comodín cubre cualquier slot de símbolo pero nunca un slot de daño', () => {
    for (const slot of ['Horn', 'Wing', 'Claw', 'Tail', 'all'] as const) {
      expect(faceMatchesSlot('wild', slot)).toBe(true);
    }
    expect(faceMatchesSlot('wild', 'damage')).toBe(false);
  });

  it('corazones, caras en blanco y daño no cubren slots de símbolo', () => {
    for (const face of ['heart', 'blank', 'damage'] as const) {
      expect(faceMatchesSlot(face, 'all')).toBe(false);
      expect(faceMatchesSlot(face, 'Horn')).toBe(false);
    }
  });
});

describe('startCombat', () => {
  it('lanza todos los dados de la reserva y registra el evento', () => {
    const s = startCombat(GARDEN_SALAAD, SETUP, 42, DICE);
    expect(s.dice).toHaveLength(5);
    expect(s.dice.map((d) => d.kind)).toEqual(SETUP.dice);
    expect(s.status).toBe('active');
    expect(s.assignments).toEqual([null, null, null, null]);
    expect(s.log[0]).toEqual({
      type: 'roll',
      dieIds: ['d0', 'd1', 'd2', 'd3', 'd4'],
      addedWhite: null,
    });
  });

  it('las caras salen de la tabla de cada tipo de dado', () => {
    const s = startCombat(GARDEN_SALAAD, SETUP, 'cualquier-seed', DICE);
    for (const d of s.dice) expect(DICE[d.kind as DieKind]).toContain(d.face);
  });

  it('rechaza reserva vacía y HPie fuera de rango', () => {
    expect(() => startCombat(GARDEN_SALAAD, { ...SETUP, dice: [] }, 1, DICE)).toThrow(CombatError);
    expect(() => startCombat(GARDEN_SALAAD, { ...SETUP, hp: 0 }, 1, DICE)).toThrow(/HPie/);
    expect(() => startCombat(GARDEN_SALAAD, { ...SETUP, hp: 7 }, 1, DICE)).toThrow(/HPie/);
    expect(() => startCombat(GARDEN_SALAAD, { ...SETUP, hp: 2.5 }, 1, DICE)).toThrow(/HPie/);
  });
});

describe('asignar y desasignar dados', () => {
  const table = fixedTable({ red: 'Claw', green: 'wild' });

  it('asigna un dado que coincide y lo saca de la reserva', () => {
    const s0 = startCombat(GARDEN_SALAAD, SETUP, 1, table);
    expect(validSlotsFor(s0, 'd0')).toEqual([0, 1, 3]);
    const s1 = act(s0, { type: 'assign', dieId: 'd0', slot: 0 });
    expect(s1.assignments[0]).toBe('d0');
    expect(availableDice(s1).map((d) => d.id)).not.toContain('d0');
    expect(validSlotsFor(s1, 'd0')).toEqual([]);
    expect(previewOutcome(s1)).toBe('flee');
  });

  it('el comodín del dado especial cubre un slot de otro símbolo', () => {
    const s = act(startCombat(GARDEN_SALAAD, SETUP, 1, table), {
      type: 'assign',
      dieId: 'd4',
      slot: 2,
    });
    expect(s.assignments[2]).toBe('d4');
  });

  it('rechaza cara incorrecta, slot ocupado, slot fuera de rango y dado inexistente', () => {
    const s0 = startCombat(GARDEN_SALAAD, SETUP, 1, table);
    expect(() => act(s0, { type: 'assign', dieId: 'd0', slot: 2 })).toThrow(/no cubre/);
    const s1 = act(s0, { type: 'assign', dieId: 'd0', slot: 0 });
    expect(() => act(s1, { type: 'assign', dieId: 'd1', slot: 0 })).toThrow(/ya está cubierto/);
    expect(() => act(s1, { type: 'assign', dieId: 'd0', slot: 1 })).toThrow(
      /no está en la reserva/,
    );
    expect(() => act(s0, { type: 'assign', dieId: 'd0', slot: 4 })).toThrow(/Slot inválido/);
    expect(() => act(s0, { type: 'assign', dieId: 'zz', slot: 0 })).toThrow(/no existe/);
    expect(validSlotsFor(s0, 'zz')).toEqual([]);
  });

  it('desasignar devuelve el dado a la reserva', () => {
    const s1 = act(startCombat(GARDEN_SALAAD, SETUP, 1, table), {
      type: 'assign',
      dieId: 'd0',
      slot: 0,
    });
    const s2 = act(s1, { type: 'unassign', slot: 0 });
    expect(s2.assignments[0]).toBeNull();
    expect(availableDice(s2).map((d) => d.id)).toContain('d0');
    expect(() => act(s2, { type: 'unassign', slot: 0 })).toThrow(/vacío/);
    expect(() => act(s2, { type: 'unassign', slot: -1 })).toThrow(/Slot inválido/);
  });
});

describe('relanzar (push your luck)', () => {
  it('cada relanzamiento añade un dado de daño blanco', () => {
    const s0 = startCombat(GARDEN_SALAAD, SETUP, 7, DICE);
    const s1 = act(s0, { type: 'reroll', dieIds: ['d0', 'd1'] });
    expect(s1.dice).toHaveLength(6);
    expect(s1.dice[5]?.kind).toBe('white');
    expect(s1.rerolls).toBe(1);
    const roll = s1.log.find((e, i) => i > 0 && e.type === 'roll');
    expect(roll).toEqual({ type: 'roll', dieIds: ['d0', 'd1', 'd5'], addedWhite: 'd5' });
  });

  it('el orden de los ids no altera el resultado (determinismo)', () => {
    const s0 = startCombat(GARDEN_SALAAD, SETUP, 7, DICE);
    const a = act(s0, { type: 'reroll', dieIds: ['d0', 'd3'] });
    const b = act(s0, { type: 'reroll', dieIds: ['d3', 'd0'] });
    expect(a.dice).toEqual(b.dice);
  });

  it('rechaza relanzar sin dados, dados repetidos o dados asignados', () => {
    const table = fixedTable({ red: 'Claw' });
    const s0 = startCombat(GARDEN_SALAAD, SETUP, 1, table);
    expect(() => act(s0, { type: 'reroll', dieIds: [] }, table)).toThrow(/al menos un dado/);
    expect(() => act(s0, { type: 'reroll', dieIds: ['d0', 'd0'] }, table)).toThrow(/repetidos/);
    const s1 = act(s0, { type: 'assign', dieId: 'd0', slot: 0 }, table);
    expect(() => act(s1, { type: 'reroll', dieIds: ['d0'] }, table)).toThrow(
      /no está en la reserva/,
    );
    expect(() => act(s1, { type: 'reroll', dieIds: ['nope'] }, table)).toThrow(/no existe/);
  });

  it('una cara en blanco del dado blanco permanece en la reserva y puede relanzarse', () => {
    const table = fixedTable({ red: 'Claw', white: 'blank' });
    const s1 = act(
      startCombat(GARDEN_SALAAD, SETUP, 1, table),
      { type: 'reroll', dieIds: ['d0'] },
      table,
    );
    expect(availableDice(s1).map((d) => d.id)).toContain('d5');
    const s2 = act(s1, { type: 'reroll', dieIds: ['d5'] }, table);
    expect(s2.dice).toHaveLength(7);
    expect(s2.hp).toBe(6);
  });

  it('el comodín del dado blanco cubre un slot de símbolo', () => {
    const table = fixedTable({ red: 'Tail', white: 'wild' });
    const s1 = act(
      startCombat(GARDEN_SALAAD, SETUP, 1, table),
      { type: 'reroll', dieIds: ['d0'] },
      table,
    );
    expect(validSlotsFor(s1, 'd5')).toEqual([0, 1, 2, 3]);
  });
});

describe('daño y corazones (escudo)', () => {
  it('sin corazones, cada cara de daño quita 1 HPie y el dado se gasta', () => {
    const table = fixedTable({ red: 'Claw', white: 'damage' });
    const s1 = act(
      startCombat(GARDEN_SALAAD, SETUP, 1, table),
      { type: 'reroll', dieIds: ['d0'] },
      table,
    );
    expect(s1.hp).toBe(5);
    expect(s1.spent).toEqual(['d5']);
    expect(s1.log.at(-1)).toEqual({
      type: 'damage',
      dieId: 'd5',
      blockedBy: null,
      coveredSlot: null,
    });
  });

  it('un corazón en la reserva bloquea el daño y se gasta', () => {
    const table = fixedTable({ red: 'heart', white: 'damage' });
    const s1 = act(
      startCombat(GARDEN_SALAAD, SETUP, 1, table),
      { type: 'reroll', dieIds: ['d4'] },
      table,
    );
    expect(s1.hp).toBe(6);
    expect(s1.spent).toEqual(['d5', 'd0']);
  });

  it('daño y escudo simultáneos: corazones lanzados en la misma tirada también bloquean', () => {
    // 2 caras de daño, 1 corazón, todo en la tirada inicial
    const table = fixedTable({ red: 'heart', white: 'damage' });
    const s = startCombat(
      GARDEN_SALAAD,
      { dice: ['red', 'white', 'white'], hp: 6, maxHp: 6 },
      1,
      table,
    );
    expect(s.hp).toBe(5);
    expect(s.spent).toEqual(['d1', 'd0', 'd2']);
  });

  it('un slot de daño se cubre al recibir daño, y el daño aún se paga', () => {
    const table = fixedTable({ red: 'Claw', white: 'damage' });
    const s1 = act(
      startCombat(PORCUPINEAPPLE, SETUP, 1, table),
      { type: 'reroll', dieIds: ['d0'] },
      table,
    );
    expect(s1.assignments[3]).toBe('d5');
    expect(s1.hp).toBe(5);
    expect(() => act(s1, { type: 'unassign', slot: 3 }, table)).toThrow(/no se puede deshacer/);
    expect(validSlotsFor(s1, 'd1')).toEqual([0, 1]);
  });

  it('un corazón puede pagar el daño del slot de daño', () => {
    const table = fixedTable({ red: 'heart', white: 'damage' });
    const s1 = act(
      startCombat(PORCUPINEAPPLE, SETUP, 1, table),
      { type: 'reroll', dieIds: ['d4'] },
      table,
    );
    expect(s1.assignments[3]).toBe('d5');
    expect(s1.hp).toBe(6);
  });

  it('KO cuando el HPie llega a 0: el combate termina', () => {
    const table = fixedTable({ red: 'Claw', white: 'damage' });
    const s0 = startCombat(GARDEN_SALAAD, { ...SETUP, hp: 1 }, 1, table);
    const s1 = act(s0, { type: 'reroll', dieIds: ['d0'] }, table);
    expect(s1).toMatchObject({ hp: 0, ko: true, status: 'resolved', outcome: 'ko', trophy: null });
    expect(() => act(s1, { type: 'reroll', dieIds: ['d1'] }, table)).toThrow(/ya terminó/);
  });

  it('KO y derrota en la misma tirada: se conservan los beneficios', () => {
    const table = fixedTable({ red: 'Claw', green: 'wild', white: 'damage' });
    let s = startCombat(PORCUPINEAPPLE, { ...SETUP, hp: 1 }, 1, table);
    s = act(s, { type: 'assign', dieId: 'd0', slot: 0 }, table);
    s = act(s, { type: 'assign', dieId: 'd1', slot: 1 }, table);
    s = act(s, { type: 'assign', dieId: 'd4', slot: 2 }, table);
    s = act(s, { type: 'reroll', dieIds: ['d2'] }, table);
    expect(s).toMatchObject({ hp: 0, ko: true, outcome: 'defeat', trophy: 'Claw' });
  });
});

describe('resolver el monstruo', () => {
  const table = fixedTable({ red: 'Claw', green: 'wild' });
  const base = () => startCombat(GARDEN_SALAAD, SETUP, 1, table);

  it('no se puede resolver sin ningún símbolo', () => {
    expect(previewOutcome(base())).toBeNull();
    expect(() => act(base(), { type: 'resolve' }, table)).toThrow(/al menos un símbolo/);
  });

  it('1 símbolo = huir, sin trofeo', () => {
    const s = act(
      act(base(), { type: 'assign', dieId: 'd0', slot: 0 }, table),
      { type: 'resolve' },
      table,
    );
    expect(s).toMatchObject({ status: 'resolved', outcome: 'flee', trophy: null });
  });

  it('2 símbolos = estudiar; exige un trofeo válido del monstruo', () => {
    let s = act(base(), { type: 'assign', dieId: 'd0', slot: 0 }, table);
    s = act(s, { type: 'assign', dieId: 'd1', slot: 3 }, table);
    expect(previewOutcome(s)).toBe('study');
    expect(() => act(s, { type: 'resolve' }, table)).toThrow(/Elige un trofeo/);
    expect(() => act(s, { type: 'resolve', trophy: 'Tail' }, table)).toThrow(/no es un trofeo/);
    expect(act(s, { type: 'resolve', trophy: 'Horn' }, table)).toMatchObject({
      outcome: 'study',
      trophy: 'Horn',
    });
  });

  it('4 símbolos = derrotar', () => {
    let s = base();
    s = act(s, { type: 'assign', dieId: 'd0', slot: 0 }, table);
    s = act(s, { type: 'assign', dieId: 'd1', slot: 1 }, table);
    s = act(s, { type: 'assign', dieId: 'd4', slot: 2 }, table);
    s = act(s, { type: 'assign', dieId: 'd2', slot: 3 }, table);
    expect(coveredSlots(s)).toBe(4);
    expect(act(s, { type: 'resolve', trophy: 'Claw' }, table)).toMatchObject({
      outcome: 'defeat',
      ko: false,
    });
  });

  it('rechaza acciones desconocidas', () => {
    expect(() => act(base(), { type: 'cheat' } as unknown as CombatAction, table)).toThrow(
      /desconocida/,
    );
  });
});

describe('replayCombat (validación en servidor)', () => {
  it('re-simular seed + acciones produce el mismo estado que jugar paso a paso', () => {
    const actions: CombatAction[] = [
      { type: 'reroll', dieIds: ['d0', 'd1', 'd2'] },
      { type: 'reroll', dieIds: ['d3'] },
    ];
    let live = startCombat(BEEHOLDER, SETUP, 'partida-13', DICE);
    for (const a of actions) live = act(live, a);
    expect(replayCombat(BEEHOLDER, SETUP, 'partida-13', actions, DICE)).toEqual(live);
  });

  it('un cliente tramposo que declara una asignación ilegal es rechazado', () => {
    const table = fixedTable({ red: 'Tail' });
    expect(() =>
      replayCombat(GARDEN_SALAAD, SETUP, 1, [{ type: 'assign', dieId: 'd0', slot: 0 }], table),
    ).toThrow(CombatError);
  });

  it('Property: mismo seed + mismas acciones => mismo estado final', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.string()),
        fc.integer({ min: 0, max: 3 }),
        (seed, n) => {
          const actions: CombatAction[] = Array.from({ length: n }, () => ({
            type: 'reroll',
            dieIds: ['d4'],
          }));
          const run = () => {
            try {
              return replayCombat(GARDEN_SALAAD, SETUP, seed, actions, DICE);
            } catch (e) {
              return (e as Error).message; // el combate pudo terminar antes: también debe ser determinista
            }
          };
          expect(run()).toEqual(run());
        },
      ),
    );
  });

  it('Property: el HPie nunca baja de 0 ni supera el máximo', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 6 }), (seed, hp) => {
        let s = startCombat(GARDEN_SALAAD, { ...SETUP, hp }, seed, DICE);
        for (let i = 0; i < 10 && s.status === 'active'; i++) {
          s = act(s, { type: 'reroll', dieIds: [availableDice(s)[0]!.id] });
        }
        expect(s.hp).toBeGreaterThanOrEqual(0);
        expect(s.hp).toBeLessThanOrEqual(6);
      }),
    );
  });
});

describe('pickEncounterPair', () => {
  it('ofrece dos monstruos de distinto tipo de símbolo', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const [a, b] = pickEncounterPair([GARDEN_SALAAD, PORCUPINEAPPLE, BEEHOLDER], seed);
        expect(a.type).not.toBe(b.type);
      }),
    );
  });

  it('falla si todos los monstruos son del mismo tipo', () => {
    expect(() => pickEncounterPair([GARDEN_SALAAD, PORCUPINEAPPLE], 1)).toThrow(/dos tipos/);
    expect(() => pickEncounterPair([], 1)).toThrow(CombatError);
  });
});
