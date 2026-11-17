// Feedback del cliente del 2026-11-11 (D-46..D-50): daño opcional, auto con comodines
// temporales, validación previa de habilidades, Cloning Tool en combate, destrezas de dado con
// trofeo y los espacios nuevos del pueblo.
import { describe, expect, it } from 'vitest';
import { actionError, applyAction, autoFillPlan, resolveOptions, startCombat } from '../combat.js';
import type { CombatState } from '../combat.js';
import { applyGameAction, newGame, rechargeTargets, trophyCapacity } from '../game.js';
import type { GameData, GameState } from '../game.js';
import {
  ABILITIES,
  ability,
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
  config: CONFIG,
  monsters: [GARDEN_SALAAD, PORCUPINEAPPLE, BEEHOLDER],
  abilities: ABILITIES,
  secretQuests: SECRET_QUESTS,
  quests: QUESTS,
  dice: DICE,
};

function town(patch: Partial<GameState> = {}): GameState {
  const g = applyGameAction(newGame(DATA, 'f-11'), { type: 'start', die: 'green' }, DATA);
  return {
    ...g,
    phase: 'town',
    run: null,
    map: null,
    position: null,
    townActions: 2,
    townUsed: [],
    items: [],
    ...patch,
  };
}

describe('espacio de daño opcional (porcupineapple: Claw, Claw, Horn, damage)', () => {
  const table = fixedTable({ red: 'Claw' });
  const fight = () =>
    startCombat(PORCUPINEAPPLE, { dice: ['red', 'red', 'red'], hp: 4, maxHp: 4 }, 1, table);

  it('con un dado: huir sin daño o estudiar con 1 de daño', () => {
    const s = applyAction(fight(), { type: 'assign', dieId: 'd0', slot: 0 }, table);
    expect(resolveOptions(s)).toEqual([
      { outcome: 'flee', damage: 0 },
      { outcome: 'study', damage: 1 },
    ]);
    const fled = applyAction(s, { type: 'resolve', damage: 0 }, table);
    expect(fled).toMatchObject({ outcome: 'flee', hp: 4 });
    const studied = applyAction(s, { type: 'resolve', damage: 1, trophy: 'Claw' }, table);
    expect(studied).toMatchObject({ outcome: 'study', hp: 3 });
  });

  it('con dos dados: estudiar sin daño', () => {
    let s = applyAction(fight(), { type: 'assign', dieId: 'd0', slot: 0 }, table);
    s = applyAction(s, { type: 'assign', dieId: 'd1', slot: 1 }, table);
    expect(resolveOptions(s)).toEqual([{ outcome: 'study', damage: 0 }]);
    expect(applyAction(s, { type: 'resolve', damage: 0, trophy: 'Claw' }, table).hp).toBe(4);
    // Sin `damage` se paga todo, como antes (partidas guardadas)
    expect(applyAction(s, { type: 'resolve', trophy: 'Claw' }, table).hp).toBe(3);
    expect(() => applyAction(s, { type: 'resolve', damage: 2, trophy: 'Claw' }, table)).toThrow(
      /espacio/,
    );
  });

  it('con tres dados: estudiar sin daño o derrotar pagando el daño', () => {
    const t = fixedTable({ red: 'wild' });
    let s = startCombat(PORCUPINEAPPLE, { dice: ['red', 'red', 'red'], hp: 4, maxHp: 4 }, 1, t);
    for (const [i, slot] of [0, 1, 2].entries()) {
      s = applyAction(s, { type: 'assign', dieId: `d${i}`, slot }, t);
    }
    expect(resolveOptions(s)).toEqual([
      { outcome: 'study', damage: 0 },
      { outcome: 'defeat', damage: 1 },
    ]);
  });
});

describe('Auto prioriza los comodines temporales', () => {
  it('usa el comodín blanco antes que el comodín del dado especial', () => {
    const base = startCombat(
      BEEHOLDER,
      { dice: ['green'], hp: 4, maxHp: 4 },
      1,
      fixedTable({ green: 'wild' }),
    );
    const s: CombatState = {
      ...base,
      dice: [...base.dice, { id: 'w', kind: 'white', face: 'wild' }],
      assignments: ['x', 'x', 'x', null],
    };
    expect(autoFillPlan(s, ['d0', 'w'])).toEqual([{ dieId: 'w', slot: 3 }]);
  });
});

describe('habilidades', () => {
  it('Boom Blade no se activa con un dado blanco en blanco (se avisa antes de elegir trofeo)', () => {
    const base = startCombat(
      GARDEN_SALAAD,
      { dice: ['red', 'red'], hp: 4, maxHp: 4, abilities: [ability('x-ray-laser')] },
      1,
      fixedTable({ red: 'Claw' }),
    );
    const s: CombatState = {
      ...base,
      dice: [...base.dice, { id: 'w', kind: 'white', face: 'blank' }],
    };
    const action = {
      type: 'ability',
      abilityId: 'x-ray-laser',
      dieIds: ['d0', 'd1', 'w'],
      trophy: 'Claw',
    } as const;
    expect(actionError(s, action, DICE)).toMatch(/no activa/);
  });

  it('Cloning Tool en combate: un objeto usado con este monstruo se puede volver a usar', () => {
    const table = fixedTable({ red: 'Wing' });
    const combat = startCombat(
      BEEHOLDER,
      { dice: ['red', 'red'], hp: 4, maxHp: 4, abilities: [ability('extra-ammo')] },
      1,
      table,
    );
    const used = applyAction(
      combat,
      { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] },
      table,
    );
    const g = town({
      phase: 'combat',
      combat: used,
      items: [
        { id: 'cloning-tool', ready: true },
        { id: 'extra-ammo', ready: true },
      ],
    });
    expect(rechargeTargets(g, DATA)).toEqual(['extra-ammo']);
    const r = applyGameAction(g, { type: 'recharge', target: 'extra-ammo' }, DATA);
    expect(r.items).toEqual([
      { id: 'cloning-tool', ready: false },
      { id: 'extra-ammo', ready: true },
    ]);
    expect(r.combat?.usedAbilities).toEqual([]);
    const again = applyGameAction(
      r,
      { type: 'combat', action: { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d1'] } },
      DATA,
    );
    expect(again.combat?.usedAbilities).toEqual(['extra-ammo']);
  });

  it('las destrezas de dado especial dan un trofeo de su color (no un espacio)', () => {
    const g = town({ trophies: [], offer: { kind: 'skill', ids: ['pierfect-shot'] } });
    const r = applyGameAction(g, { type: 'pick', abilityId: 'pierfect-shot' }, DATA);
    expect(r.dice).toContain('blue');
    expect(r.trophies).toEqual(['Wing']);
    expect(trophyCapacity(r, DATA)).toBe(CONFIG.player.trophySlots);
  });
});

describe('espacios nuevos del pueblo', () => {
  it('saqueo: +2 trofeos; sin espacio se decide uno por uno', () => {
    const g = town({ trophies: ['Horn'] });
    const r = applyGameAction(g, { type: 'scavenge' }, DATA);
    expect(r.trophies).toHaveLength(2);
    expect(r.pendingTrophy).not.toBeNull();
    expect(r.townActions).toBe(1);
    const k = applyGameAction(r, { type: 'keep', discard: null }, DATA);
    expect(k.pendingTrophy).toBeNull();

    const full = applyGameAction(town({ trophies: ['Horn', 'Horn'] }), { type: 'scavenge' }, DATA);
    expect(full.pendingTrophy).not.toBeNull();
    expect(full.overflow).toHaveLength(1);
    const first = applyGameAction(full, { type: 'keep', discard: null }, DATA);
    expect(first.pendingTrophy).not.toBeNull();
    expect(first.overflow).toEqual([]);
    expect(applyGameAction(first, { type: 'keep', discard: 0 }, DATA).pendingTrophy).toBeNull();
  });

  it('alquimista: 2 distintas de +1 HPie, +1 trofeo, +1 espacio', () => {
    const g = town({ trophies: [], hp: 2 });
    const r = applyGameAction(g, { type: 'alchemist', picks: ['hp', 'slot'] }, DATA);
    expect(r).toMatchObject({ maxHp: 5, hp: 3, extraSlots: 1 });
    expect(trophyCapacity(r, DATA)).toBe(CONFIG.player.trophySlots + 1);
    const t = applyGameAction(g, { type: 'alchemist', picks: ['trophy', 'slot'] }, DATA);
    expect(t.trophies).toHaveLength(1);
    expect(() => applyGameAction(g, { type: 'alchemist', picks: ['hp', 'hp'] }, DATA)).toThrow(
      /2 opciones/,
    );
  });

  it('entrenamiento: +1 dado rojo; forja: un rojo → dado de color + trofeo', () => {
    const g = town({ trophies: [] });
    const reds = g.dice.filter((d) => d === 'red').length;
    const trained = applyGameAction(g, { type: 'training' }, DATA);
    expect(trained.dice.filter((d) => d === 'red')).toHaveLength(reds + 1);
    const forged = applyGameAction(g, { type: 'forge', die: 'orange' }, DATA);
    expect(forged.dice.filter((d) => d === 'red')).toHaveLength(reds - 1);
    expect(forged.dice).toContain('orange');
    expect(forged.trophies).toHaveLength(1);
    // Cada espacio, una vez por visita
    expect(() => applyGameAction(trained, { type: 'training' }, DATA)).toThrow(/esta visita/);
    // Sin dados rojos no se puede forjar
    expect(() =>
      applyGameAction(town({ dice: ['green'] }), { type: 'forge', die: 'blue' }, DATA),
    ).toThrow(/rojo/);
  });
});
