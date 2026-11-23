// Feedback final del cliente (V1, 2026-11-22): dado blanco desde el segundo SNAC, estudiar con 3
// dados, AUTO sin comodín en "any 4", primer combate guiado programado y Entrenamiento que
// recarga un objeto. El puntaje y Pieland se prueban en game.test.ts.
import { describe, expect, it } from 'vitest';
import { applyAction, autoFillPlan, coveredSlots, startCombat } from '../combat.js';
import type { CombatState } from '../combat.js';
import { remainingPool } from '../run.js';
import { applyGameAction, newGame, reachableNodes } from '../game.js';
import type { GameData, GameState } from '../game.js';
import type { Monster } from '../types.js';
import {
  ABILITIES,
  BEEHOLDER,
  CONFIG,
  DICE,
  fixedTable,
  GARDEN_SALAAD,
  PORCUPINEAPPLE,
  QUESTS,
  SECRET_QUESTS,
} from './fixtures.js';

const DATA: GameData = {
  config: {
    ...CONFIG,
    player: { ...CONFIG.player, whiteDieFromFight: 2 },
    tutorial: {
      ...CONFIG.tutorial,
      guided: {
        monsterId: 'porcupineapple',
        item: 'auto-aimer',
        roll: {
          orange: ['Claw', 'Wing', 'Tail', 'Tail', 'Horn'],
          blue: ['Claw', 'Wing', 'Horn', 'Tail', 'Wing'],
          purple: ['Claw', 'Wing', 'Horn', 'Tail', 'Tail'],
          green: ['Tail', 'Wing', 'Horn', 'Tail', 'Claw'],
        },
      },
    },
  },
  monsters: [GARDEN_SALAAD, PORCUPINEAPPLE, BEEHOLDER],
  abilities: ABILITIES,
  secretQuests: SECRET_QUESTS,
  quests: QUESTS,
  dice: DICE,
};

function act(state: GameState, action: Parameters<typeof applyGameAction>[1], data = DATA) {
  return applyGameAction(state, action, data);
}

function follow(state: GameState, data = DATA): GameState {
  const [node] = reachableNodes(state);
  if (!node) throw new Error('test: sin nodos');
  return act(state, { type: 'follow', node }, data);
}

describe('dado blanco desde el segundo SNAC', () => {
  const data: GameData = {
    ...DATA,
    dice: fixedTable({ red: 'Claw', green: 'Claw', white: 'blank' }),
  };

  it('el primer SNAC se pelea sin blanco; desde el segundo siempre hay uno', () => {
    let g = act(newGame(data, 's'), { type: 'start', die: 'green' }, data);
    g = follow(g, data);
    expect(g.combat!.dice.some((d) => d.kind === 'white')).toBe(false);
    // Lo derrota sin relanzar nunca
    for (const [i, slot] of [0, 1, 3].entries()) {
      g = act(g, { type: 'combat', action: { type: 'assign', dieId: `d${i}`, slot } }, data);
    }
    g = act(g, { type: 'combat', action: { type: 'resolve', trophy: 'Claw' } }, data);
    if (g.pendingTrophy) g = act(g, { type: 'keep', discard: null }, data);
    g = act(g, { type: 'continue' }, data);
    g = follow(g, data);
    expect(g.combat!.dice.filter((d) => d.kind === 'white')).toHaveLength(1);
  });

  it('no agrega otro si ya trae un blanco en blanco de la pelea anterior', () => {
    let g = act(newGame(data, 's'), { type: 'start', die: 'green' }, data);
    g = { ...g, fights: 3, run: { ...g.run!, pool: ['red', 'white'] } };
    g = follow(g, data);
    expect(g.combat!.dice.map((d) => d.kind)).toEqual(['red', 'white']);
  });
});

describe('estudiar con 3 dados', () => {
  const table = fixedTable({ red: 'Claw' });
  const setup = { dice: ['red', 'red', 'red', 'red'] as const, hp: 4, maxHp: 4 };

  it('estudiar solo pide 2 símbolos: el tercer dado vuelve a la reserva', () => {
    let s: CombatState = startCombat(GARDEN_SALAAD, { ...setup, dice: [...setup.dice] }, 1, table);
    for (const [i, slot] of [0, 1, 3].entries()) {
      s = applyAction(s, { type: 'assign', dieId: `d${i}`, slot }, table);
    }
    const done = applyAction(s, { type: 'resolve', trophy: 'Claw' }, table);
    expect(done.outcome).toBe('study');
    expect(coveredSlots(done)).toBe(2);
    expect(done.assignments).toEqual(['d0', 'd1', null, null]);
    expect(remainingPool(done)).toEqual(['red', 'red']);
  });

  it('un dado de verdad vuelve antes que un trofeo; el trofeo que sobra vuelve al inventario', () => {
    let s: CombatState = startCombat(
      GARDEN_SALAAD,
      { dice: ['red', 'red'], hp: 4, maxHp: 4, trophies: ['Claw', 'Horn'] },
      1,
      table,
    );
    s = applyAction(s, { type: 'trophy', index: 0, slot: 0 }, table);
    s = applyAction(s, { type: 'assign', dieId: 'd0', slot: 1 }, table);
    s = applyAction(s, { type: 'trophy', index: 0, slot: 3 }, table);
    const done = applyAction(s, { type: 'resolve', trophy: 'Claw' }, table);
    expect(done.outcome).toBe('study');
    // Se devuelve el dado rojo (no un trofeo): los trofeos colocados se gastan
    expect(remainingPool(done)).toEqual(['red', 'red']);
    expect(done.trophies).toEqual([]);
  });
});

describe('AUTO no gasta un comodín en "any 4"', () => {
  const MONSTER: Monster = {
    id: 'test',
    name: 'Test',
    type: 'Horn',
    slots: ['all', 'Horn', 'Tail', 'Tail'],
    trophies: ['Horn'],
    pun: '',
  };

  it('si otro dado cabe en "any 4", el comodín va a otro espacio', () => {
    const table = fixedTable({ red: 'wild', orange: 'Horn' });
    const s = startCombat(MONSTER, { dice: ['red', 'orange'], hp: 4, maxHp: 4 }, 1, table);
    const plan = autoFillPlan(s, ['d0', 'd1']);
    expect(plan).toHaveLength(2);
    expect(plan.find((p) => p.slot === 0)?.dieId).not.toBe('d0');
  });

  it('con solo un comodín, sí lo pone en "any 4" si no hay otro lugar', () => {
    const table = fixedTable({ red: 'wild' });
    const only: Monster = { ...MONSTER, slots: ['all', 'damage', 'damage', 'damage'] };
    const s = startCombat(only, { dice: ['red'], hp: 4, maxHp: 4 }, 1, table);
    expect(autoFillPlan(s, ['d0'])).toEqual([{ dieId: 'd0', slot: 0 }]);
  });
});

describe('partida guiada: primer combate programado', () => {
  it('Auto-Aimer como objeto inicial, Porcupineapple y una tirada con solo 2 coincidencias', () => {
    let g = act(newGame(DATA, 'g'), { type: 'start', die: 'green', guided: true });
    expect(g.items).toEqual([{ id: 'auto-aimer', ready: true }]);
    const first = g.map!.nodes.filter((n) => n.column === 0);
    expect(first.every((n) => n.monsterId === 'porcupineapple' && n.type === 'Claw')).toBe(true);
    g = follow(g);
    const combat = g.combat!;
    expect(combat.dice.map((d) => d.face)).toEqual(['Tail', 'Wing', 'Horn', 'Tail', 'Claw']);
    const ids = combat.dice.map((d) => d.id);
    expect(autoFillPlan(combat, ids)).toHaveLength(2);
    // La flecha roja activa el Auto-Aimer
    expect(combat.abilities.map((a) => a.id)).toContain('auto-aimer');
    expect(combat.dice[1]).toMatchObject({ kind: 'red', face: 'Wing' });
  });

  it('sin partida guiada todo sigue al azar', () => {
    const g = act(newGame(DATA, 'g'), { type: 'start', die: 'green' });
    expect(g.items[0]?.id).not.toBe(undefined);
    const tutorial = follow(act(newGame(DATA, 'g'), { type: 'start', die: 'green', guided: true }));
    const free = follow(g);
    expect(free.combat!.dice.map((d) => d.face)).not.toEqual(
      tutorial.combat!.dice.map((d) => d.face),
    );
  });
});

describe('Entrenamiento', () => {
  it('+1 dado rojo y recarga el objeto gastado elegido', () => {
    const base = act(newGame(DATA, 't'), { type: 'start', die: 'green' });
    const g: GameState = {
      ...base,
      phase: 'town',
      run: null,
      map: null,
      townActions: 2,
      items: [
        { id: 'auto-aimer', ready: false },
        { id: 'extra-ammo', ready: false },
      ],
    };
    const trained = act(g, { type: 'training', item: 'extra-ammo' });
    expect(trained.dice.filter((d) => d === 'red')).toHaveLength(5);
    expect(trained.items).toEqual([
      { id: 'auto-aimer', ready: false },
      { id: 'extra-ammo', ready: true },
    ]);
    // Sin elegir, recarga el primero; un objeto que no está gastado no se puede elegir
    expect(act(g, { type: 'training' }).items[0]).toEqual({ id: 'auto-aimer', ready: true });
    expect(() =>
      act(
        { ...g, items: [{ id: 'auto-aimer', ready: true }] },
        { type: 'training', item: 'auto-aimer' },
      ),
    ).toThrow(/gastado/);
  });
});
