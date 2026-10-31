// RF-12: Tests de la expedición — correcciones de reglas del cliente (2026-10-20):
// dados gastados toda la expedición, dados blancos que se acumulan, KO y huida terminan la run.
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  applyAction,
  availableDice,
  CombatError,
  coveredSlots,
  startCombat,
  validSlotsFor,
} from '../combat.js';
import type { CombatAction, CombatState } from '../combat.js';
import {
  canHunt,
  endCombat,
  hasHuntingDice,
  remainingPool,
  replayRun,
  returnToTown,
  runCombatSetup,
  startRun,
} from '../run.js';
import type { RunFight, RunSetup, RunState } from '../run.js';
import type { DiceTable, Monster } from '../types.js';
import { BEEHOLDER, DICE, fixedTable, GARDEN_SALAAD } from './fixtures.js';

const SETUP: RunSetup = { dice: ['red', 'red', 'red', 'red', 'green'], maxHp: 4 };

/** Juega un combate de la expedición aplicando las acciones dadas. */
function fight(
  run: RunState,
  monster: Monster,
  table: DiceTable,
  actions: readonly CombatAction[],
  seed: number | string = 1,
): CombatState {
  return actions.reduce(
    (s, a) => applyAction(s, a, table),
    startCombat(monster, runCombatSetup(run), seed, table),
  );
}

describe('startRun', () => {
  it('sale del pueblo con el HPie completo y todos los dados', () => {
    const run = startRun(SETUP);
    expect(run).toEqual({
      hp: 4,
      maxHp: 4,
      pool: SETUP.dice,
      fights: 0,
      status: 'active',
      endedBy: null,
    });
    expect(runCombatSetup(run)).toEqual({ dice: SETUP.dice, hp: 4, maxHp: 4 });
  });

  it('rechaza reserva vacía, dados blancos iniciales y HPie inválido', () => {
    expect(() => startRun({ ...SETUP, dice: [] })).toThrow(CombatError);
    expect(() => startRun({ ...SETUP, dice: ['red', 'white'] })).toThrow(/blancos/);
    expect(() => startRun({ ...SETUP, maxHp: 0 })).toThrow(/HPie/);
    expect(() => startRun({ ...SETUP, maxHp: 1.5 })).toThrow(/HPie/);
    expect(() => startRun({ ...SETUP, hp: 0 })).toThrow(/HPie/);
    expect(() => startRun({ ...SETUP, hp: SETUP.maxHp + 1 })).toThrow(/HPie/);
    expect(startRun({ ...SETUP, hp: 2 }).hp).toBe(2);
  });
});

describe('dados gastados toda la expedición', () => {
  const table = fixedTable({ red: 'Claw', green: 'wild' });

  it('los dados usados para derrotar no vuelven en el siguiente combate', () => {
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'assign', dieId: 'd4', slot: 2 },
      { type: 'assign', dieId: 'd2', slot: 3 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    expect(combat.outcome).toBe('defeat');
    const next = endCombat(run, combat);
    expect(next).toMatchObject({ pool: ['red'], hp: 4, fights: 1, status: 'active' });
    expect(runCombatSetup(next).dice).toEqual(['red']);
  });

  it('los dados usados para estudiar también quedan gastados', () => {
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'resolve', trophy: 'Horn' },
    ]);
    expect(combat.outcome).toBe('study');
    expect(endCombat(run, combat)).toMatchObject({
      pool: ['red', 'red', 'green'],
      status: 'active',
    });
  });

  it('un dado asignado y luego desasignado no se gasta', () => {
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'unassign', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 0 },
      { type: 'assign', dieId: 'd2', slot: 1 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    expect(remainingPool(combat)).toEqual(['red', 'red', 'green']);
  });

  it('los corazones que bloquearon daño quedan gastados', () => {
    const shieldTable = fixedTable({ red: 'heart', green: 'Claw', white: 'damage' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, shieldTable, [
      { type: 'reroll', dieIds: ['d0'] },
      { type: 'block', dieId: 'd0', damageId: 'd5' },
      { type: 'assign', dieId: 'd4', slot: 0 },
      { type: 'resolve' },
    ]);
    // El blanco d5 hizo daño, d0 lo bloqueó, d4 se usó para huir
    expect(combat.spent).toEqual(['d5', 'd0']);
    expect(combat.hp).toBe(4);
    expect(remainingPool(combat)).toEqual(['red', 'red', 'red']);
  });

  it('sin dados se puede seguir cazando: solo se lanzarán dados blancos', () => {
    const run = startRun({ dice: ['red', 'red', 'red', 'green'], maxHp: 4 });
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'assign', dieId: 'd3', slot: 2 },
      { type: 'assign', dieId: 'd2', slot: 3 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    const next = endCombat(run, combat);
    expect(next.pool).toEqual([]);
    expect(next.status).toBe('active');
    expect(canHunt(next)).toBe(true);
    expect(hasHuntingDice(next)).toBe(false);
    const empty = startCombat(BEEHOLDER, runCombatSetup(next), 2, table);
    expect(empty.dice).toEqual([]);
    const pushed = applyAction(empty, { type: 'reroll', dieIds: [] }, table);
    expect(pushed.dice.map((d) => d.kind)).toEqual(['white']);
    expect(returnToTown(next)).toMatchObject({ status: 'ended', endedBy: 'town' });
  });
});

describe('dados blancos en la expedición', () => {
  it('los blancos sin resolver pasan al siguiente monstruo hasta volver al pueblo', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw', white: 'blank' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d3'] },
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'assign', dieId: 'd2', slot: 3 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    expect(availableDice(combat).some((d) => d.kind === 'white')).toBe(true);
    const next = endCombat(run, combat);
    expect(next.pool).toEqual(['red', 'green', 'white']);
    const second = startCombat(BEEHOLDER, runCombatSetup(next), 2, table);
    expect(second.dice.map((d) => d.kind)).toEqual(['red', 'green', 'white']);
  });

  it('los blancos en blanco se acumulan de un combate a otro', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw', white: 'blank' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d3'] },
      { type: 'reroll', dieIds: ['d3'] },
      { type: 'reroll', dieIds: ['d5'] },
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    expect(availableDice(combat).filter((d) => d.kind === 'white')).toHaveLength(3);
    expect(remainingPool(combat)).toEqual(['red', 'red', 'green', 'white', 'white', 'white']);
  });

  it('un blanco comodín se resuelve al usarlo en el monstruo; si no se usa, sigue en la reserva', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw', white: 'wild' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d4'] },
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    expect(combat.dice.find((d) => d.id === 'd5')).toMatchObject({ kind: 'white', face: 'wild' });
    expect(remainingPool(combat)).toEqual(['red', 'red', 'green', 'white']);
    const used = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d4'] },
      { type: 'assign', dieId: 'd5', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    expect(remainingPool(used)).toEqual(['red', 'red', 'red', 'green']);
  });

  it('el comodín blanco usado en el monstruo se gasta como cualquier dado', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw', white: 'wild' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d4'] },
      { type: 'assign', dieId: 'd5', slot: 2 },
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'resolve', trophy: 'Horn' },
    ]);
    expect(remainingPool(combat)).toEqual(['red', 'red', 'red', 'green']);
  });
});

describe('HPie y fin de la expedición', () => {
  it('el HPie perdido se arrastra al siguiente combate', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw', white: 'damage' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d3'] },
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'resolve', trophy: 'Claw' },
    ]);
    const next = endCombat(run, combat);
    expect(next.hp).toBe(3);
    expect(runCombatSetup(next).hp).toBe(3);
  });

  it('huir termina la expedición', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'resolve' },
    ]);
    expect(endCombat(run, combat)).toMatchObject({ status: 'ended', endedBy: 'flee' });
  });

  it('KO termina la expedición con 0 HPie', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw', white: 'damage' });
    const run = startRun({ ...SETUP, maxHp: 1 });
    // El daño del primer relanzamiento se recibe al relanzar otra vez
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d3'] },
      { type: 'reroll', dieIds: ['d3'] },
    ]);
    expect(combat.outcome).toBe('ko');
    expect(endCombat(run, combat)).toMatchObject({ hp: 0, status: 'ended', endedBy: 'ko' });
  });

  it('KO y derrota en la misma tirada: se gana el monstruo pero la expedición termina', () => {
    const table = fixedTable({ red: 'Claw', green: 'wild', white: 'damage' });
    const run = startRun({ ...SETUP, maxHp: 1 });
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd1', slot: 1 },
      { type: 'assign', dieId: 'd4', slot: 2 },
      { type: 'assign', dieId: 'd2', slot: 3 },
    ]);
    // Aún no se resuelve: forzamos el KO relanzando dos veces el único dado libre
    const hurt = applyAction(combat, { type: 'reroll', dieIds: ['d3'] }, table);
    const ko = applyAction(hurt, { type: 'reroll', dieIds: ['d3'] }, table);
    expect(ko).toMatchObject({ outcome: 'defeat', ko: true });
    expect(endCombat(run, ko)).toMatchObject({ status: 'ended', endedBy: 'ko' });
  });

  it('volver al pueblo es decisión del jugador entre combates', () => {
    const run = returnToTown(startRun(SETUP));
    expect(run).toMatchObject({ status: 'ended', endedBy: 'town' });
    expect(canHunt(run)).toBe(false);
  });

  it('nada se puede hacer en una expedición terminada', () => {
    const ended = returnToTown(startRun(SETUP));
    const combat = startCombat(GARDEN_SALAAD, runCombatSetup(startRun(SETUP)), 1, DICE);
    expect(() => returnToTown(ended)).toThrow(/ya terminó/);
    expect(() => runCombatSetup(ended)).toThrow(/ya terminó/);
    expect(() => endCombat(ended, combat)).toThrow(/ya terminó/);
  });

  it('no se puede cerrar un combate que sigue activo', () => {
    const run = startRun(SETUP);
    const combat = startCombat(GARDEN_SALAAD, runCombatSetup(run), 1, fixedTable({}));
    expect(() => endCombat(run, combat)).toThrow(/no ha terminado/);
  });

  it('volver al pueblo recupera todo: la nueva expedición no arrastra nada', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw', white: 'blank' });
    const run = startRun(SETUP);
    const combat = fight(run, GARDEN_SALAAD, table, [
      { type: 'reroll', dieIds: ['d3'] },
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'resolve' },
    ]);
    expect(endCombat(run, combat).status).toBe('ended');
    expect(startRun(SETUP)).toMatchObject({ hp: 4, pool: SETUP.dice });
  });
});

/** Cliente honesto: asigna todo lo que puede; si no cubre nada, relanza; luego resuelve. */
function playHonestly(run: RunState, monster: Monster, seed: string): RunFight {
  let s = startCombat(monster, runCombatSetup(run), seed, DICE);
  const actions: CombatAction[] = [];
  const doAct = (a: CombatAction) => {
    s = applyAction(s, a, DICE);
    actions.push(a);
  };
  for (let tries = 0; s.status === 'active' && tries < 3; tries++) {
    for (const die of availableDice(s)) {
      const slot = validSlotsFor(s, die.id)[0];
      if (slot !== undefined) doAct({ type: 'assign', dieId: die.id, slot });
    }
    const free = availableDice(s)[0];
    if (s.status === 'active' && coveredSlots(s) === 0 && free) {
      doAct({ type: 'reroll', dieIds: [free.id] });
    } else break;
  }
  if (s.status === 'active' && coveredSlots(s) > 0) {
    doAct({ type: 'resolve', trophy: monster.trophies[0] });
  }
  return { monster, seed, actions };
}

describe('replayRun (validación en servidor)', () => {
  it('re-simular la expedición da el mismo estado que jugarla combate por combate', () => {
    let run = startRun(SETUP);
    const fights: RunFight[] = [];
    for (const [i, monster] of [GARDEN_SALAAD, BEEHOLDER, GARDEN_SALAAD].entries()) {
      if (!canHunt(run)) break;
      const f = playHonestly(run, monster, `seed-${i}`);
      const combat = fight(run, f.monster, DICE, f.actions, f.seed);
      if (combat.status !== 'resolved') break;
      fights.push(f);
      run = endCombat(run, combat);
    }
    expect(replayRun(SETUP, fights, DICE).run).toEqual(run);
  });

  it('rechaza un combate después de que la expedición terminó', () => {
    const flee: RunFight = {
      monster: GARDEN_SALAAD,
      seed: 1,
      actions: [{ type: 'assign', dieId: 'd0', slot: 0 }, { type: 'resolve' }],
    };
    const table = fixedTable({ red: 'Claw', green: 'Claw' });
    expect(replayRun(SETUP, [flee], table).run.endedBy).toBe('flee');
    expect(() => replayRun(SETUP, [flee, flee], table)).toThrow(/ya terminó/);
  });

  it('rechaza un combate sin terminar y acciones ilegales', () => {
    const table = fixedTable({ red: 'Claw', green: 'Claw' });
    const open: RunFight = { monster: GARDEN_SALAAD, seed: 1, actions: [] };
    expect(() => replayRun(SETUP, [open], table)).toThrow(/no ha terminado/);
    // Un tramposo usa en el 2.º combate un dado que gastó en el 1.º
    const study: RunFight = {
      monster: GARDEN_SALAAD,
      seed: 1,
      actions: [
        { type: 'assign', dieId: 'd0', slot: 0 },
        { type: 'assign', dieId: 'd1', slot: 1 },
        { type: 'resolve', trophy: 'Claw' },
      ],
    };
    const cheat: RunFight = {
      monster: GARDEN_SALAAD,
      seed: 2,
      actions: [{ type: 'assign', dieId: 'd3', slot: 0 }],
    };
    expect(() => replayRun(SETUP, [study, cheat], table)).toThrow(/no existe/);
  });

  it('Property: los dados de color nunca aumentan y el HPie se mantiene en [0, máx]', () => {
    const monsters = [GARDEN_SALAAD, BEEHOLDER];
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string(), fc.integer({ min: 0, max: 1 })), {
          minLength: 1,
          maxLength: 5,
        }),
        (plan) => {
          let run = startRun(SETUP);
          const colored = (r: RunState) => r.pool.filter((k) => k !== 'white').length;
          for (const [seed, m] of plan) {
            if (!canHunt(run)) break;
            const f = playHonestly(run, monsters[m]!, seed);
            const combat = fight(run, f.monster, DICE, f.actions, f.seed);
            if (combat.status !== 'resolved') break;
            const next = endCombat(run, combat);
            expect(colored(next)).toBeLessThanOrEqual(colored(run));
            expect(next.hp).toBeGreaterThanOrEqual(0);
            expect(next.hp).toBeLessThanOrEqual(next.maxHp);
            run = next;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
