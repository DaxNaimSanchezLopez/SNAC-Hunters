// RF-13, RF-14: Trofeos como dados y habilidades (12 objetos + 8 destrezas de V0).
import { describe, it, expect } from 'vitest';
import { applyAction, availableDice, canRerollAny, slotsForFace, startCombat } from '../combat.js';
import type { CombatAction, CombatSetup, CombatState } from '../combat.js';
import { remainingPool } from '../run.js';
import type { DiceTable } from '../types.js';
import { ability, BEEHOLDER, fixedTable, GARDEN_SALAAD, PORCUPINEAPPLE } from './fixtures.js';

const SETUP: CombatSetup = { dice: ['red', 'red', 'red', 'red', 'green'], hp: 4, maxHp: 4 };

function play(state: CombatState, actions: readonly CombatAction[], table: DiceTable): CombatState {
  return actions.reduce((s, a) => applyAction(s, a, table), state);
}

describe('trofeos como dados', () => {
  const table = fixedTable({ red: 'heart', green: 'heart' });
  const setup: CombatSetup = { ...SETUP, trophies: ['Claw', 'Horn'] };

  it('un trofeo se coloca en un espacio que coincide con su símbolo', () => {
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    expect(slotsForFace(s0, 'Horn')).toEqual([2, 3]);
    const s1 = applyAction(s0, { type: 'trophy', index: 1, slot: 2 }, table);
    expect(s1.assignments[2]).toBe('d5');
    expect(s1.dice.at(-1)).toEqual({ id: 'd5', kind: 'trophy', face: 'Horn' });
    expect(s1.trophies).toEqual(['Claw']);
  });

  it('rechaza trofeo inexistente, slot que no coincide y slot ocupado', () => {
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    expect(() => applyAction(s0, { type: 'trophy', index: 5, slot: 0 }, table)).toThrow(
      /No tienes el trofeo/,
    );
    expect(() => applyAction(s0, { type: 'trophy', index: 1, slot: 0 }, table)).toThrow(/no cubre/);
    const s1 = applyAction(s0, { type: 'trophy', index: 0, slot: 0 }, table);
    expect(() => applyAction(s1, { type: 'trophy', index: 0, slot: 0 }, table)).toThrow(
      /ya está cubierto/,
    );
  });

  it('retirar un trofeo del monstruo lo devuelve al inventario', () => {
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    const s1 = applyAction(s0, { type: 'trophy', index: 0, slot: 0 }, table);
    const s2 = applyAction(s1, { type: 'unassign', slot: 0 }, table);
    expect(s2.trophies).toEqual(['Horn', 'Claw']);
    expect(s2.dice.some((d) => d.kind === 'trophy')).toBe(false);
    expect(s2.assignments[0]).toBeNull();
  });

  it('al resolver, los trofeos usados se gastan y no pasan a la reserva', () => {
    const s = play(
      startCombat(GARDEN_SALAAD, setup, 1, table),
      [
        { type: 'trophy', index: 0, slot: 0 },
        { type: 'trophy', index: 0, slot: 2 },
        { type: 'resolve', trophy: 'Claw' },
      ],
      table,
    );
    expect(s.outcome).toBe('study');
    expect(s.trophies).toEqual([]);
    expect(remainingPool(s)).toEqual(['red', 'red', 'red', 'red', 'green']);
  });
});

describe('habilidades', () => {
  const wings = fixedTable({ red: 'Wing', green: 'Claw' });
  const withAbilities = (...ids: string[]): CombatSetup => ({
    ...SETUP,
    abilities: ids.map(ability),
  });

  it('1 → 2: un símbolo se convierte en dos símbolos nuevos que no se relanzan', () => {
    const s0 = startCombat(BEEHOLDER, withAbilities('extra-ammo'), 1, wings);
    const s1 = applyAction(s0, { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] }, wings);
    expect(s1.spent).toEqual(['d0']);
    expect(s1.dice.slice(-2)).toEqual([
      { id: 'd5', kind: 'token', face: 'Wing' },
      { id: 'd6', kind: 'token', face: 'Wing' },
    ]);
    expect(() => applyAction(s1, { type: 'reroll', dieIds: ['d5'] }, wings)).toThrow(
      /no se relanzan/,
    );
    const s2 = play(
      s1,
      [
        { type: 'assign', dieId: 'd5', slot: 0 },
        { type: 'assign', dieId: 'd6', slot: 1 },
      ],
      wings,
    );
    expect(s2.assignments.slice(0, 2)).toEqual(['d5', 'd6']);
  });

  it('1 → comodín: el comodín creado cubre un espacio de otro símbolo', () => {
    const s = play(
      startCombat(BEEHOLDER, withAbilities('auto-aimer'), 1, wings),
      [
        { type: 'ability', abilityId: 'auto-aimer', dieIds: ['d0'] },
        { type: 'assign', dieId: 'd5', slot: 2 },
      ],
      wings,
    );
    expect(s.dice.find((d) => d.id === 'd5')?.face).toBe('wild');
    expect(s.assignments[2]).toBe('d5');
  });

  it('2 → 3: dos símbolos iguales se convierten en tres comodines', () => {
    const s = applyAction(
      startCombat(BEEHOLDER, withAbilities('double-damage'), 1, wings),
      { type: 'ability', abilityId: 'double-damage', dieIds: ['d1', 'd2'] },
      wings,
    );
    expect(s.spent).toEqual(['d1', 'd2']);
    expect(s.dice.slice(-3).map((d) => d.face)).toEqual(['wild', 'wild', 'wild']);
  });

  it('×3 = derrotar: gana de inmediato con cualquier trofeo, ignorando los espacios', () => {
    const s = applyAction(
      startCombat(BEEHOLDER, withAbilities('meaty-crossbow'), 1, wings),
      { type: 'ability', abilityId: 'meaty-crossbow', dieIds: ['d0', 'd1', 'd2'], trophy: 'Tail' },
      wings,
    );
    expect(s).toMatchObject({ status: 'resolved', outcome: 'defeat', trophy: 'Tail', ko: false });
    expect(remainingPool(s)).toEqual(['red', 'green']);
  });

  it('×3 también derrota a un monstruo con espacio de daño, sin recibirlo', () => {
    const claws = fixedTable({ red: 'Claw', green: 'Claw' });
    const s = applyAction(
      startCombat(PORCUPINEAPPLE, withAbilities('x-ray-laser'), 1, claws),
      { type: 'ability', abilityId: 'x-ray-laser', dieIds: ['d0', 'd1', 'd4'], trophy: 'Claw' },
      claws,
    );
    expect(s).toMatchObject({ outcome: 'defeat', hp: 4 });
  });

  it('×3 exige elegir un trofeo', () => {
    const s0 = startCombat(BEEHOLDER, withAbilities('meaty-crossbow'), 1, wings);
    expect(() =>
      applyAction(
        s0,
        { type: 'ability', abilityId: 'meaty-crossbow', dieIds: ['d0', 'd1', 'd2'] },
        wings,
      ),
    ).toThrow(/Elige un trofeo/);
  });

  it('el comodín cuenta como cualquier símbolo para activar habilidades', () => {
    const wild = fixedTable({ red: 'Wing', green: 'wild' });
    const s = applyAction(
      startCombat(BEEHOLDER, withAbilities('extra-ammo'), 1, wild),
      { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d4'] },
      wild,
    );
    expect(s.spent).toEqual(['d4']);
  });

  it('cada habilidad se usa una vez por monstruo', () => {
    const s1 = applyAction(
      startCombat(BEEHOLDER, withAbilities('extra-ammo'), 1, wings),
      { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] },
      wings,
    );
    expect(() =>
      applyAction(s1, { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d1'] }, wings),
    ).toThrow(/Ya usaste/);
  });

  it('rechaza habilidad ajena, cara incorrecta, cantidad incorrecta y dados no disponibles', () => {
    const s0 = startCombat(BEEHOLDER, withAbilities('extra-ammo', 'double-damage'), 1, wings);
    const use = (abilityId: string, dieIds: string[]) =>
      applyAction(s0, { type: 'ability', abilityId, dieIds }, wings);
    expect(() => use('meaty-crossbow', ['d0', 'd1', 'd2'])).toThrow(/No tienes la habilidad/);
    expect(() => use('extra-ammo', ['d4'])).toThrow(/no activa/);
    expect(() => use('extra-ammo', ['d0', 'd1'])).toThrow(/necesita 1/);
    expect(() => use('double-damage', ['d0', 'd0'])).toThrow(/necesita 2/);
    expect(() => use('extra-ammo', ['zz'])).toThrow(/no existe/);
    const s1 = applyAction(s0, { type: 'assign', dieId: 'd0', slot: 0 }, wings);
    expect(() =>
      applyAction(s1, { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] }, wings),
    ).toThrow(/no está en la reserva/);
  });

  it('las destrezas de dado especial son pasivas: no aparecen en combate', () => {
    const s = startCombat(BEEHOLDER, withAbilities('pierfect-shot', 'extra-ammo'), 1, wings);
    expect(s.abilities.map((a) => a.id)).toEqual(['extra-ammo']);
  });

  it('los símbolos consumidos quedan gastados toda la expedición; los creados desaparecen', () => {
    const s = play(
      startCombat(BEEHOLDER, withAbilities('extra-ammo'), 1, wings),
      [
        { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] },
        { type: 'assign', dieId: 'd5', slot: 0 },
        { type: 'resolve' },
      ],
      wings,
    );
    expect(remainingPool(s)).toEqual(['red', 'red', 'red', 'green']);
  });
});

describe('sin dados que relanzar', () => {
  it('se puede empujar la suerte solo con el dado blanco para no quedar trabado', () => {
    const table = fixedTable({ red: 'heart', white: 'damage' });
    const setup: CombatSetup = { dice: ['red'], hp: 4, maxHp: 4 };
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    expect(() => applyAction(s0, { type: 'reroll', dieIds: [] }, table)).toThrow(
      /al menos un dado/,
    );
    // El corazón bloquea el daño del primer blanco y ambos se gastan
    const s1 = applyAction(s0, { type: 'reroll', dieIds: ['d0'] }, table);
    expect(availableDice(s1)).toEqual([]);
    expect(canRerollAny(s1)).toBe(false);
    const s2 = applyAction(s1, { type: 'reroll', dieIds: [] }, table);
    expect(s2.dice).toHaveLength(3);
    expect(s2.hp).toBe(3);
  });
});
