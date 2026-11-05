// RF-13, RF-14: Trofeos como dados y habilidades (12 objetos + 8 destrezas de V0).
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  availableDice,
  canActivate,
  canRerollAny,
  canUndo,
  previewOutcome,
  slotsForFace,
  startCombat,
} from '../combat.js';
import type { CombatAction, CombatSetup, CombatState } from '../combat.js';
import { remainingPool } from '../run.js';
import type { DiceTable, Monster } from '../types.js';
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

  it('un trofeo del inventario también activa habilidades y se gasta', () => {
    const blanks = fixedTable({ red: 'heart', green: 'heart' });
    const setup: CombatSetup = { ...withAbilities('auto-aimer'), trophies: ['Claw', 'Wing'] };
    const s0 = startCombat(BEEHOLDER, setup, 1, blanks);
    const s1 = applyAction(
      s0,
      { type: 'ability', abilityId: 'auto-aimer', dieIds: [], trophies: [1] },
      blanks,
    );
    expect(s1.trophies).toEqual(['Claw']);
    expect(s1.dice.slice(-2)).toEqual([
      { id: 'd5', kind: 'trophy', face: 'Wing' },
      // El comodín de Auto-Aimer es azul: cuenta como el comodín del dado especial azul
      { id: 'd6', kind: 'token', face: 'wild', color: 'blue' },
    ]);
    expect(s1.spent).toEqual(['d5']);
    expect(() =>
      applyAction(
        s0,
        { type: 'ability', abilityId: 'auto-aimer', dieIds: [], trophies: [0] },
        blanks,
      ),
    ).toThrow(/no activa/);
    expect(() =>
      applyAction(
        s0,
        { type: 'ability', abilityId: 'auto-aimer', dieIds: [], trophies: [7] },
        blanks,
      ),
    ).toThrow(/No tienes el trofeo/);
  });

  it('dados y trofeos se combinan para activar una habilidad', () => {
    const setup: CombatSetup = { ...withAbilities('double-damage'), trophies: ['Wing'] };
    const s = applyAction(
      startCombat(BEEHOLDER, setup, 1, wings),
      { type: 'ability', abilityId: 'double-damage', dieIds: ['d0'], trophies: [0] },
      wings,
    );
    expect(s.trophies).toEqual([]);
    expect(s.spent).toEqual(['d0', 'd5']);
    expect(s.dice.slice(-3).map((d) => d.face)).toEqual(['wild', 'wild', 'wild']);
  });

  it('hasta resolver nada es definitivo: deshacer devuelve dados y trofeos', () => {
    const setup: CombatSetup = { ...withAbilities('double-damage'), trophies: ['Wing'] };
    const s0 = startCombat(BEEHOLDER, setup, 1, wings);
    const s1 = play(
      s0,
      [
        { type: 'ability', abilityId: 'double-damage', dieIds: ['d0'], trophies: [0] },
        { type: 'assign', dieId: 'd6', slot: 2 },
      ],
      wings,
    );
    const s2 = applyAction(s1, { type: 'undo', abilityId: 'double-damage' }, wings);
    expect(s2.usedAbilities).toEqual([]);
    expect(s2.trophies).toEqual(['Wing']);
    expect(s2.spent).toEqual([]);
    expect(s2.assignments).toEqual([null, null, null, null]);
    expect(s2.dice.map((d) => d.id)).toEqual(s0.dice.map((d) => d.id));
    // y se puede volver a usar
    const s3 = applyAction(
      s2,
      { type: 'ability', abilityId: 'double-damage', dieIds: ['d0', 'd1'] },
      wings,
    );
    expect(s3.usedAbilities).toEqual(['double-damage']);
  });

  it('deshacer solo vale hasta relanzar: después sería una trampa', () => {
    const s0 = startCombat(BEEHOLDER, withAbilities('extra-ammo'), 1, wings);
    const s1 = applyAction(s0, { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] }, wings);
    expect(canUndo(s1, 'extra-ammo')).toBe(true);
    const s2 = applyAction(s1, { type: 'reroll', dieIds: ['d1'] }, wings);
    expect(canUndo(s2, 'extra-ammo')).toBe(false);
    expect(() => applyAction(s2, { type: 'undo', abilityId: 'extra-ammo' }, wings)).toThrow(
      /Ya relanzaste/,
    );
  });

  // Mismo caso que reportó el cliente con Scent and Sound (2 Lupas) → Double Damage
  it('los comodines temporales de una habilidad activan otra', () => {
    const horns = fixedTable({ red: 'Horn', green: 'Horn' });
    const s0 = startCombat(BEEHOLDER, withAbilities('ambidexterity', 'double-damage'), 1, horns);
    expect(canActivate(s0, ability('double-damage'))).toBe(false);
    const s1 = applyAction(
      s0,
      { type: 'ability', abilityId: 'ambidexterity', dieIds: ['d0', 'd1'] },
      horns,
    );
    const wilds = availableDice(s1).filter((d) => d.kind === 'token');
    expect(wilds.map((d) => d.face)).toEqual(['wild', 'wild', 'wild']);
    expect(canActivate(s1, ability('double-damage'))).toBe(true);
    const s2 = applyAction(
      s1,
      {
        type: 'ability',
        abilityId: 'double-damage',
        dieIds: wilds.slice(0, 2).map((d) => d.id),
      },
      horns,
    );
    expect(s2.usedAbilities).toEqual(['ambidexterity', 'double-damage']);
    expect(availableDice(s2).filter((d) => d.kind === 'token')).toHaveLength(4);
  });

  it('no se deshace una habilidad sin usar ni una cuyos símbolos activaron otra', () => {
    const s0 = startCombat(BEEHOLDER, withAbilities('auto-aimer', 'extra-ammo'), 1, wings);
    expect(() => applyAction(s0, { type: 'undo', abilityId: 'auto-aimer' }, wings)).toThrow(
      /No has usado/,
    );
    // extra-ammo crea dos Ala; una activa auto-aimer
    const s1 = play(
      s0,
      [
        { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] },
        { type: 'ability', abilityId: 'auto-aimer', dieIds: ['d5'] },
      ],
      wings,
    );
    expect(() => applyAction(s1, { type: 'undo', abilityId: 'extra-ammo' }, wings)).toThrow(
      /deshaz esa primero/,
    );
    const s2 = play(
      s1,
      [
        { type: 'undo', abilityId: 'auto-aimer' },
        { type: 'undo', abilityId: 'extra-ammo' },
      ],
      wings,
    );
    expect(s2.usedAbilities).toEqual([]);
    expect(availableDice(s2)).toHaveLength(5);
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
    // El corazón cubre el daño del primer blanco; al seguir, ambos se gastan
    const s1 = applyAction(s0, { type: 'reroll', dieIds: ['d0'] }, table);
    const s2 = applyAction(s1, { type: 'block', dieId: 'd0', damageId: 'd1' }, table);
    expect(availableDice(s2)).toEqual([]);
    expect(canRerollAny(s2)).toBe(false);
    const s3 = applyAction(s2, { type: 'reroll', dieIds: [] }, table);
    expect(s3.dice).toHaveLength(3);
    expect(s3.hp).toBe(4);
    expect(s3.spent).toEqual(['d1', 'd0']);
  });
});

describe('comodín blanco (feedback 2026-11-03)', () => {
  it('no se relanza: se queda en la bandeja; el comodín de un dado de color sí se relanza', () => {
    const table = fixedTable({ red: 'Tail', green: 'wild', white: 'wild' });
    const s0 = startCombat(GARDEN_SALAAD, SETUP, 1, table);
    const s1 = applyAction(s0, { type: 'reroll', dieIds: ['d0'] }, table);
    expect(s1.dice.at(-1)).toMatchObject({ id: 'd5', kind: 'white', face: 'wild' });
    expect(() => applyAction(s1, { type: 'reroll', dieIds: ['d5'] }, table)).toThrow(
      /comodín blanco no se relanza/,
    );
    expect(() => applyAction(s1, { type: 'reroll', dieIds: ['d4'] }, table)).not.toThrow();
    const s2 = applyAction(s1, { type: 'reroll', dieIds: ['d0'] }, table);
    expect(availableDice(s2).map((d) => d.id)).toContain('d5');
  });

  it('con solo comodines blancos en la bandeja se relanza únicamente un dado blanco nuevo', () => {
    const table = fixedTable({ red: 'heart', white: 'wild' });
    const s0 = startCombat(GARDEN_SALAAD, { dice: ['red'], hp: 3, maxHp: 4 }, 1, table);
    const s1 = play(
      s0,
      [
        { type: 'reroll', dieIds: ['d0'] },
        { type: 'heal', dieId: 'd0' },
      ],
      table,
    );
    expect(availableDice(s1).map((d) => d.kind)).toEqual(['white']);
    expect(canRerollAny(s1)).toBe(false);
    const s2 = applyAction(s1, { type: 'reroll', dieIds: [] }, table);
    expect(availableDice(s2).filter((d) => d.kind === 'white')).toHaveLength(2);
  });
});

describe('cartas V02', () => {
  it('Lucky: un comodín del dado especial de su color se convierte en dos', () => {
    const table = fixedTable({ red: 'Tail', green: 'wild' });
    const setup: CombatSetup = {
      ...SETUP,
      abilities: [ability('lucky-find'), ability('lucky-hit')],
    };
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    expect(canActivate(s0, ability('lucky-find'))).toBe(true);
    expect(canActivate(s0, ability('lucky-hit'))).toBe(false);
    expect(() =>
      applyAction(s0, { type: 'ability', abilityId: 'lucky-find', dieIds: ['d0'] }, table),
    ).toThrow(/no activa/);
    const s1 = applyAction(s0, { type: 'ability', abilityId: 'lucky-find', dieIds: ['d4'] }, table);
    expect(s1.dice.slice(-2).map((d) => [d.kind, d.face])).toEqual([
      ['token', 'wild'],
      ['token', 'wild'],
    ]);
  });

  it('una carta de comodín da el comodín de su color, y la Lucky de ese color lo duplica', () => {
    const table = fixedTable({ red: 'Horn', green: 'Claw' });
    const setup: CombatSetup = {
      ...SETUP,
      abilities: [ability('sentient-sword'), ability('lucky-hit')],
    };
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    expect(canActivate(s0, ability('lucky-hit'))).toBe(false);
    const s1 = applyAction(
      s0,
      { type: 'ability', abilityId: 'sentient-sword', dieIds: ['d0'] },
      table,
    );
    const sword = s1.dice.at(-1)!;
    expect(sword).toMatchObject({ kind: 'token', face: 'wild', color: 'orange' });
    const s2 = applyAction(
      s1,
      { type: 'ability', abilityId: 'lucky-hit', dieIds: [sword.id] },
      table,
    );
    expect(availableDice(s2).filter((d) => d.face === 'wild')).toHaveLength(2);
  });

  it('Double Healing: un corazón se convierte en dos (un comodín no sirve)', () => {
    const table = fixedTable({ red: 'heart', green: 'wild' });
    const setup: CombatSetup = { ...SETUP, hp: 2, abilities: [ability('double-healing')] };
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    expect(() =>
      applyAction(s0, { type: 'ability', abilityId: 'double-healing', dieIds: ['d4'] }, table),
    ).toThrow(/no activa/);
    const s1 = applyAction(
      s0,
      { type: 'ability', abilityId: 'double-healing', dieIds: ['d0'] },
      table,
    );
    const hearts = s1.dice.slice(-2);
    expect(hearts.map((d) => d.face)).toEqual(['heart', 'heart']);
    const healed = play(
      s1,
      hearts.map((d): CombatAction => ({ type: 'heal', dieId: d.id })),
      table,
    );
    expect(healed.hp).toBe(4);
  });

  it('Cursed Gauntlet: cuesta 1 HPie y da un comodín; deshacerla devuelve el HPie', () => {
    const table = fixedTable({ red: 'Tail', green: 'Tail' });
    const setup: CombatSetup = { ...SETUP, hp: 3, abilities: [ability('cursed-gauntlet')] };
    const s0 = startCombat(GARDEN_SALAAD, setup, 1, table);
    const s1 = applyAction(
      s0,
      { type: 'ability', abilityId: 'cursed-gauntlet', dieIds: [] },
      table,
    );
    expect(s1.hp).toBe(2);
    expect(s1.dice.at(-1)).toMatchObject({ kind: 'token', face: 'wild' });
    const undone = applyAction(s1, { type: 'undo', abilityId: 'cursed-gauntlet' }, table);
    expect(undone.hp).toBe(3);
    expect(undone.dice).toHaveLength(5);
    const weak = startCombat(GARDEN_SALAAD, { ...setup, hp: 1 }, 1, table);
    expect(canActivate(weak, ability('cursed-gauntlet'))).toBe(false);
    expect(() =>
      applyAction(weak, { type: 'ability', abilityId: 'cursed-gauntlet', dieIds: [] }, table),
    ).toThrow(/No te queda HPie/);
  });

  it('las cartas pasivas o de fuera de combate no aparecen en el combate', () => {
    const setup: CombatSetup = {
      ...SETUP,
      abilities: [ability('cloning-tool'), ability('varied-samples'), ability('pierfect-shot')],
    };
    expect(startCombat(GARDEN_SALAAD, setup, 1, fixedTable({})).abilities).toEqual([]);
  });
});

describe('jefe (RF-16)', () => {
  const BOSS: Monster = {
    id: 'pieous',
    name: 'Pieous Assassin',
    type: 'Horn',
    slots: ['Horn', 'Horn', 'Wing', 'Wing', 'Claw', 'Tail'],
    trophies: [],
    pun: '',
    boss: true,
  };
  const wilds = fixedTable({ red: 'wild', green: 'wild' });
  const six: CombatSetup = { dice: ['red', 'red', 'red', 'red', 'red', 'green'], hp: 4, maxHp: 4 };

  it('solo se derrota cubriendo todos sus espacios y no da trofeo; con menos, se huye', () => {
    const s0 = startCombat(BOSS, six, 1, wilds);
    expect(s0.assignments).toHaveLength(6);
    const five = play(
      s0,
      [0, 1, 2, 3, 4].map((slot): CombatAction => ({ type: 'assign', dieId: `d${slot}`, slot })),
      wilds,
    );
    expect(previewOutcome(five)).toBe('flee');
    const all = applyAction(five, { type: 'assign', dieId: 'd5', slot: 5 }, wilds);
    expect(previewOutcome(all)).toBe('defeat');
    const won = applyAction(all, { type: 'resolve' }, wilds);
    expect(won).toMatchObject({ outcome: 'defeat', trophy: null });
  });

  it('"tres iguales" no sirve contra el jefe', () => {
    const wings = fixedTable({ red: 'Wing', green: 'Wing' });
    const setup: CombatSetup = { ...six, abilities: [ability('meaty-crossbow')] };
    const s0 = startCombat(BOSS, setup, 1, wings);
    expect(canActivate(s0, ability('meaty-crossbow'))).toBe(false);
    expect(() =>
      applyAction(
        s0,
        {
          type: 'ability',
          abilityId: 'meaty-crossbow',
          dieIds: ['d0', 'd1', 'd2'],
          trophy: 'Horn',
        },
        wings,
      ),
    ).toThrow(/no sirve contra el jefe/);
  });
});
