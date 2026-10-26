// RF-15: Partida V0 — pueblo, expediciones, trofeos como dinero, habilidades y puntaje.
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { availableDice, canRerollAny, coveredSlots, validSlotsFor } from '../combat.js';
import {
  applyGameAction,
  finalScore,
  newGame,
  readyAbilities,
  replayGame,
  trophyCapacity,
} from '../game.js';
import type { GameAction, GameData, GameState } from '../game.js';
import type { DiceTable } from '../types.js';
import {
  ABILITIES,
  BEEHOLDER,
  CONFIG,
  DICE,
  fixedTable,
  GARDEN_SALAAD,
  PORCUPINEAPPLE,
} from './fixtures.js';

const DATA: GameData = {
  config: CONFIG,
  monsters: [GARDEN_SALAAD, PORCUPINEAPPLE, BEEHOLDER],
  abilities: ABILITIES,
  dice: DICE,
};

/** Datos con dados trucados: cualquier dado sale siempre con el mismo símbolo. */
function rigged(overrides: Parameters<typeof fixedTable>[0]): GameData {
  return { ...DATA, dice: fixedTable(overrides) as DiceTable };
}

function run(state: GameState, actions: readonly GameAction[], data = DATA): GameState {
  return actions.reduce((s, a) => applyGameAction(s, a, data), state);
}

/** Partida recién empezada con el cazador verde (dado especial de lupas). */
function begin(data: GameData, seed: string): GameState {
  return applyGameAction(newGame(data, seed), { type: 'start', die: 'green' }, data);
}

/** El personaje en el pueblo antes de su primera expedición, para probar el pueblo. */
function townGame(data: GameData, seed: string): GameState {
  return { ...begin(data, seed), phase: 'town', run: null, trail: null, runs: 0 };
}

/** Estado de partida (en el pueblo) con valores arbitrarios para probar casos concretos. */
function withState(patch: Partial<GameState>, data = DATA): GameState {
  return { ...townGame(data, 'base'), ...patch };
}

describe('nueva partida', () => {
  it('primero se elige el color del cazador: su dado especial', () => {
    const g = newGame(DATA, 'seed-1');
    expect(g).toMatchObject({ phase: 'setup', dice: ['red', 'red', 'red', 'red'], runs: 0 });
    expect(() => applyGameAction(g, { type: 'follow', index: 0 }, DATA)).toThrow(/fase/);
    expect(() =>
      applyGameAction(g, { type: 'start', die: 'white' } as unknown as GameAction, DATA),
    ).toThrow(/no es un dado especial/);
    for (const die of ['orange', 'blue', 'purple', 'green'] as const) {
      const s = applyGameAction(g, { type: 'start', die }, DATA);
      expect(s.dice).toEqual(['red', 'red', 'red', 'red', die]);
    }
    const s = applyGameAction(g, { type: 'start', die: 'blue' }, DATA);
    expect(() => applyGameAction(s, { type: 'start', die: 'blue' }, DATA)).toThrow(/fase/);
  });

  it('después empieza de expedición (la caza va primero) con HPie completo, dados, 1 trofeo y 1 objeto', () => {
    const g = begin(DATA, 'seed-1');
    expect(g).toMatchObject({
      phase: 'trail',
      hp: 4,
      maxHp: 4,
      dice: ['red', 'red', 'red', 'red', 'green'],
      skills: [],
      points: 0,
      runs: 1,
    });
    expect(g.run).toMatchObject({ hp: 4, pool: ['red', 'red', 'red', 'red', 'green'], fights: 0 });
    expect(g.trail).toHaveLength(2);
    expect(() => applyGameAction(g, { type: 'rest' }, DATA)).toThrow(/fase/);
    expect(g.trophies).toHaveLength(1);
    expect(g.items).toHaveLength(1);
    expect(g.items[0]?.ready).toBe(true);
    expect(DATA.abilities.find((a) => a.id === g.items[0]?.id)?.kind).toBe('item');
  });

  it('es determinista: misma seed, misma partida', () => {
    expect(newGame(DATA, 'x')).toEqual(newGame(DATA, 'x'));
  });
});

describe('pueblo', () => {
  it('descansar sana, recarga los objetos, da un trofeo y gasta una acción', () => {
    const g = withState({ items: [{ id: 'extra-ammo', ready: false }], trophies: [], hp: 1 });
    const r = applyGameAction(g, { type: 'rest' }, DATA);
    expect(r.hp).toBe(4);
    expect(r.items).toEqual([{ id: 'extra-ammo', ready: true }]);
    expect(r.trophies).toHaveLength(1);
    expect(r.townActions).toBe(1);
    const r2 = run(r, [{ type: 'rest' }]);
    expect(() => applyGameAction(r2, { type: 'rest' }, DATA)).toThrow(/No te quedan acciones/);
  });

  it('comprar un objeto cuesta 1 trofeo y ofrece 3 cartas que no tienes', () => {
    const g = withState({ items: [{ id: 'extra-ammo', ready: true }], trophies: ['Horn', 'Wing'] });
    const b = applyGameAction(g, { type: 'buy', kind: 'item', pay: [1] }, DATA);
    expect(b.trophies).toEqual(['Horn']);
    expect(b.townActions).toBe(1);
    expect(b.offer?.kind).toBe('item');
    expect(b.offer?.ids).toHaveLength(3);
    expect(b.offer?.ids).not.toContain('extra-ammo');
    // Mientras haya cartas ofrecidas no se puede hacer otra cosa
    expect(() => applyGameAction(b, { type: 'leave' }, DATA)).toThrow(/elige una/);
    expect(() => applyGameAction(b, { type: 'rest' }, DATA)).toThrow(/elige una/);
    const chosen = b.offer?.ids[0] as string;
    const p = applyGameAction(b, { type: 'pick', abilityId: chosen }, DATA);
    expect(p.items.map((i) => i.id)).toEqual(['extra-ammo', chosen]);
    expect(p.offer).toBeNull();
  });

  it('se puede rechazar la oferta; los trofeos pagados no se devuelven', () => {
    const g = withState({ items: [], trophies: ['Horn'] });
    const b = applyGameAction(g, { type: 'buy', kind: 'item', pay: [0] }, DATA);
    const p = applyGameAction(b, { type: 'pick', abilityId: null }, DATA);
    expect(p).toMatchObject({ offer: null, items: [], trophies: [] });
  });

  it('una destreza cuesta 2 trofeos; la de dado especial agrega ese dado', () => {
    const g = withState({ trophies: ['Horn', 'Wing'], skills: [] });
    expect(() => applyGameAction(g, { type: 'buy', kind: 'skill', pay: [0] }, DATA)).toThrow(
      /Cuesta 2/,
    );
    expect(() => applyGameAction(g, { type: 'buy', kind: 'skill', pay: [0, 0] }, DATA)).toThrow(
      /repetidos/,
    );
    expect(() => applyGameAction(g, { type: 'buy', kind: 'skill', pay: [0, 5] }, DATA)).toThrow(
      /No tienes el trofeo/,
    );
    const b = applyGameAction(g, { type: 'buy', kind: 'skill', pay: [0, 1] }, DATA);
    expect(b.offer?.ids.length).toBe(3);
    const offered: GameState = { ...b, offer: { kind: 'skill', ids: ['pierfect-shot'] } };
    const p = applyGameAction(offered, { type: 'pick', abilityId: 'pierfect-shot' }, DATA);
    expect(p.skills).toEqual(['pierfect-shot']);
    expect(p.dice).toEqual(['red', 'red', 'red', 'red', 'green', 'blue']);
  });

  it('máximo 3 de cada tipo: con 3 hay que reemplazar una (y su dado especial se va)', () => {
    const g = withState({
      skills: ['pierfect-shot', 'double-damage', 'ambidexterity'],
      dice: ['red', 'blue'],
      offer: { kind: 'skill', ids: ['ambidexterity', 'x'] },
    });
    const data: GameData = {
      ...DATA,
      abilities: [
        ...ABILITIES,
        { id: 'x', name: 'X', kind: 'skill', effect: { type: 'convert', symbol: 'Tail' } },
      ],
    };
    expect(() => applyGameAction(g, { type: 'pick', abilityId: 'x' }, data)).toThrow(
      /elige cuál reemplazar/,
    );
    expect(() => applyGameAction(g, { type: 'pick', abilityId: 'nope' }, data)).toThrow(
      /no está entre/,
    );
    const p = applyGameAction(g, { type: 'pick', abilityId: 'x', replace: 'pierfect-shot' }, data);
    expect(p.skills).toEqual(['double-damage', 'ambidexterity', 'x']);
    expect(p.dice).toEqual(['red']);
    const roomy = withState({ items: [], offer: { kind: 'item', ids: ['extra-ammo'] } });
    expect(() =>
      applyGameAction(roomy, { type: 'pick', abilityId: 'extra-ammo', replace: 'y' }, DATA),
    ).toThrow(/no hace falta/);
  });

  it('no se puede comprar si no quedan cartas de ese tipo', () => {
    const items = ABILITIES.filter((a) => a.kind === 'item').map((a) => ({
      id: a.id,
      ready: true,
    }));
    const g = withState({ items, trophies: ['Horn'] });
    expect(() => applyGameAction(g, { type: 'buy', kind: 'item', pay: [0] }, DATA)).toThrow(
      /No quedan cartas/,
    );
  });

  it('los objetos con bonificación dan un espacio extra para trofeos', () => {
    const g = withState({
      items: [
        { id: 'extra-ammo', ready: false },
        { id: 'meaty-crossbow', ready: true },
      ],
    });
    expect(trophyCapacity(g, DATA)).toBe(3);
  });
});

describe('expedición', () => {
  it('salir del pueblo abre el sendero con dos rastros de tipos distintos', () => {
    const g = applyGameAction(townGame(DATA, 's'), { type: 'leave' }, DATA);
    expect(g).toMatchObject({ phase: 'trail', runs: 1, hp: 4 });
    const [a, b] = (g.trail ?? []).map((id) => DATA.monsters.find((m) => m.id === id));
    expect(a?.type).not.toBe(b?.type);
    expect(g.run?.pool).toEqual(g.dice);
  });

  it('seguir un rastro revela el monstruo y empieza el combate con trofeos y habilidades', () => {
    const trail = run(
      withState({ trophies: ['Claw'], items: [{ id: 'extra-ammo', ready: true }] }),
      [{ type: 'leave' }],
    );
    const g = applyGameAction(trail, { type: 'follow', index: 1 }, DATA);
    expect(g.phase).toBe('combat');
    expect(g.trail).toBeNull();
    expect(g.combat?.monster.id).toBe(trail.trail?.[1]);
    expect(() => applyGameAction(trail, { type: 'follow', index: 2 }, DATA)).toThrow(
      /No hay rastro/,
    );
    expect(g.combat?.trophies).toEqual(['Claw']);
    expect(g.combat?.abilities.map((a) => a.id)).toEqual(['extra-ammo']);
    expect(() => applyGameAction(g, { type: 'follow', index: 0 }, DATA)).toThrow(/fase/);
  });

  it('derrotar da puntos y trofeo; los dados usados no vuelven en el siguiente combate', () => {
    // Sin monstruos con espacio de daño: los 4 comodines siempre derrotan
    const data: GameData = {
      ...rigged({ red: 'wild', green: 'wild' }),
      monsters: [GARDEN_SALAAD, BEEHOLDER],
    };
    const g0 = run(
      withState({ trophies: [] }, data),
      [{ type: 'leave' }, { type: 'follow', index: 0 }],
      data,
    );
    const monster = g0.combat!.monster;
    const assigns = [0, 1, 2, 3].map((slot): GameAction => ({
      type: 'combat',
      action: { type: 'assign', dieId: `d${slot}`, slot },
    }));
    const g1 = run(
      g0,
      [...assigns, { type: 'combat', action: { type: 'resolve', trophy: monster.trophies[0] } }],
      data,
    );
    expect(g1).toMatchObject({ phase: 'aftermath', points: 1, fights: 1, outcomes: { defeat: 1 } });
    expect(g1.trophies).toEqual([monster.trophies[0]]);
    expect(g1.run?.pool).toEqual(['green']);
    const g2 = applyGameAction(g1, { type: 'continue' }, data);
    expect(g2.phase).toBe('trail');
    const g3 = applyGameAction(g2, { type: 'follow', index: 0 }, data);
    expect(g3.combat?.dice.map((d) => d.kind)).toEqual(['green']);
  });

  it('huir termina la expedición: solo se puede volver al pueblo', () => {
    const data = rigged({ red: 'wild', green: 'wild' });
    const g = run(
      withState({}, data),
      [
        { type: 'leave' },
        { type: 'follow', index: 1 },
        { type: 'combat', action: { type: 'assign', dieId: 'd0', slot: 0 } },
        { type: 'combat', action: { type: 'resolve' } },
      ],
      data,
    );
    expect(g.run?.endedBy).toBe('flee');
    expect(() => applyGameAction(g, { type: 'continue' }, data)).toThrow(/terminó/);
    const t = applyGameAction(g, { type: 'return' }, data);
    expect(t).toMatchObject({ phase: 'town', run: null, hp: 4, townActions: 2 });
  });

  it('KO: -1 punto, la expedición termina y en el pueblo se recupera el HPie', () => {
    const data = rigged({ red: 'Tail', green: 'Tail', white: 'damage' });
    let g = run(
      withState({ trophies: [] }, data),
      [{ type: 'leave' }, { type: 'follow', index: 0 }],
      data,
    );
    for (let i = 0; i < 8 && g.phase === 'combat'; i++) {
      g = applyGameAction(g, { type: 'combat', action: { type: 'reroll', dieIds: ['d0'] } }, data);
    }
    expect(g).toMatchObject({ phase: 'aftermath', hp: 0, kos: 1, points: -1 });
    expect(g.run?.endedBy).toBe('ko');
    expect(applyGameAction(g, { type: 'return' }, data).hp).toBe(4);
  });

  it('volver al pueblo no sana: se sale con el HPie que se tenga hasta descansar', () => {
    const g = withState({
      phase: 'aftermath',
      hp: 2,
      runs: 1,
      run: { hp: 2, maxHp: 4, pool: ['red'], fights: 1, status: 'ended', endedBy: 'flee' },
    });
    const town = applyGameAction(g, { type: 'return' }, DATA);
    expect(town.hp).toBe(2);
    const out = applyGameAction(town, { type: 'leave' }, DATA);
    expect(out.run?.hp).toBe(2);
    expect(applyGameAction(town, { type: 'rest' }, DATA).hp).toBe(4);
  });

  it('se puede volver al pueblo desde el sendero sin pelear', () => {
    const g = run(townGame(DATA, 's'), [{ type: 'leave' }, { type: 'return' }]);
    expect(g).toMatchObject({ phase: 'town', runs: 1 });
  });

  it('un objeto usado queda gastado hasta descansar; una destreza se puede volver a usar', () => {
    // Sin espacios de daño: un solo símbolo es huir
    const data = {
      ...rigged({ red: 'Wing', green: 'Wing' }),
      monsters: [GARDEN_SALAAD, BEEHOLDER],
    };
    const g = run(
      withState({ items: [{ id: 'extra-ammo', ready: true }], skills: ['double-damage'] }, data),
      [
        { type: 'leave' },
        { type: 'follow', index: 0 },
        { type: 'combat', action: { type: 'ability', abilityId: 'extra-ammo', dieIds: ['d0'] } },
        {
          type: 'combat',
          action: { type: 'ability', abilityId: 'double-damage', dieIds: ['d1', 'd2'] },
        },
      ],
      data,
    );
    const wild = g.combat!.dice.find((d) => d.face === 'wild')!;
    const done = run(
      g,
      [
        { type: 'combat', action: { type: 'assign', dieId: wild.id, slot: 0 } },
        { type: 'combat', action: { type: 'resolve' } },
      ],
      data,
    );
    expect(done.items).toEqual([{ id: 'extra-ammo', ready: false }]);
    expect(readyAbilities(done, data).map((a) => a.id)).toEqual(['double-damage']);
    const rested = run(done, [{ type: 'return' }, { type: 'rest' }], data);
    expect(rested.items).toEqual([{ id: 'extra-ammo', ready: true }]);
  });

  it('un trofeo colocado en el monstruo sale del inventario', () => {
    const data = {
      ...rigged({ red: 'heart', green: 'heart' }),
      monsters: [GARDEN_SALAAD, BEEHOLDER],
    };
    const g0 = run(
      withState({ trophies: ['Claw', 'Wing'] }, data),
      [{ type: 'leave' }, { type: 'follow', index: 0 }],
      data,
    );
    const slot = g0.combat!.monster.slots.findIndex((s) => s === 'Claw' || s === 'all');
    const g1 = run(
      g0,
      [
        { type: 'combat', action: { type: 'trophy', index: 0, slot } },
        { type: 'combat', action: { type: 'resolve' } },
      ],
      data,
    );
    expect(g1.trophies).toEqual(['Wing']);
  });
});

describe('trofeos sin espacio', () => {
  it('hay que decidir qué conservar antes de seguir', () => {
    const g = withState({ trophies: ['Horn', 'Wing'], items: [], townActions: 2 });
    const r = applyGameAction(g, { type: 'rest' }, DATA);
    expect(r.pendingTrophy).not.toBeNull();
    expect(r.trophies).toEqual(['Horn', 'Wing']);
    expect(() => applyGameAction(r, { type: 'leave' }, DATA)).toThrow(/qué trofeo conservar/);
    const swapped = applyGameAction(r, { type: 'keep', discard: 0 }, DATA);
    expect(swapped.trophies).toEqual(['Wing', r.pendingTrophy]);
    const declined = applyGameAction(r, { type: 'keep', discard: null }, DATA);
    expect(declined.trophies).toEqual(['Horn', 'Wing']);
    expect(() => applyGameAction(r, { type: 'keep', discard: 9 }, DATA)).toThrow(/No tienes/);
    expect(() => applyGameAction(swapped, { type: 'keep', discard: 0 }, DATA)).toThrow(
      /No hay trofeo pendiente/,
    );
  });
});

describe('puntaje y fin de partida', () => {
  it('puntaje final = puntos − KOs × 3 − expediciones', () => {
    const g = withState({ points: 10, kos: 2, runs: 3 });
    expect(finalScore(g, CONFIG)).toBe(10 - 6 - 3);
  });

  it('la expedición en curso no resta: la partida empieza en 0', () => {
    const out = applyGameAction(townGame(DATA, 's'), { type: 'leave' }, DATA);
    expect(out.runs).toBe(1);
    expect(finalScore(out, CONFIG)).toBe(0);
    expect(finalScore(applyGameAction(out, { type: 'return' }, DATA), CONFIG)).toBe(-1);
  });

  it('terminar la partida desde el pueblo; después no se acepta nada', () => {
    const over = applyGameAction(townGame(DATA, 's'), { type: 'finish' }, DATA);
    expect(over.phase).toBe('over');
    expect(() => applyGameAction(over, { type: 'rest' }, DATA)).toThrow(/terminó/);
    const trail = applyGameAction(townGame(DATA, 's'), { type: 'leave' }, DATA);
    expect(() => applyGameAction(trail, { type: 'finish' }, DATA)).toThrow(/fase/);
  });

  it('rechaza acciones desconocidas', () => {
    expect(() =>
      applyGameAction(townGame(DATA, 's'), { type: 'fly' } as unknown as GameAction, DATA),
    ).toThrow(/desconocida/);
  });
});

/** Jugador automático honesto: lo usa la validación en servidor y los tests de propiedades. */
function autoplay(data: GameData, seed: string, choices: readonly number[]): GameAction[] {
  let s = newGame(data, seed);
  const actions: GameAction[] = [];
  const act = (a: GameAction) => {
    s = applyGameAction(s, a, data);
    actions.push(a);
  };
  const colors = ['orange', 'blue', 'purple', 'green'] as const;
  act({ type: 'start', die: colors[(choices[0] ?? 0) % colors.length]! });
  for (const c of choices) {
    if (s.phase === 'over') break;
    if (s.pendingTrophy !== null) act({ type: 'keep', discard: c % 2 === 0 ? 0 : null });
    else if (s.phase === 'town') {
      if (s.offer) act({ type: 'pick', abilityId: s.offer.ids[0] ?? null });
      else if (c % 4 === 0 && s.townActions > 0) act({ type: 'rest' });
      else if (c % 4 === 1 && s.townActions > 0 && s.trophies.length >= 1)
        act({ type: 'buy', kind: 'item', pay: [0] });
      else act({ type: 'leave' });
    } else if (s.phase === 'trail') {
      if (s.run && s.run.pool.length > 0 && c % 5 !== 0) act({ type: 'follow', index: c % 2 });
      else act({ type: 'return' });
    } else if (s.phase === 'combat') {
      const combat = s.combat!;
      const die = availableDice(combat).find((d) => validSlotsFor(combat, d.id).length > 0);
      if (die) {
        act({
          type: 'combat',
          action: { type: 'assign', dieId: die.id, slot: validSlotsFor(combat, die.id)[0]! },
        });
      } else if (coveredSlots(combat) > 0 && c % 3 !== 0) {
        act({ type: 'combat', action: { type: 'resolve', trophy: combat.monster.trophies[0] } });
      } else {
        const free = availableDice(combat).find((d) => d.kind !== 'trophy' && d.kind !== 'token');
        act({
          type: 'combat',
          action: { type: 'reroll', dieIds: free && canRerollAny(combat) ? [free.id] : [] },
        });
      }
    } else if (s.phase === 'aftermath') {
      const canGo = s.run?.status === 'active' && (s.run?.pool.length ?? 0) > 0;
      act(canGo && c % 3 !== 0 ? { type: 'continue' } : { type: 'return' });
    }
  }
  return actions;
}

describe('replayGame (validación en servidor)', () => {
  it('re-simular seed + acciones reproduce la partida exacta', () => {
    const actions = autoplay(
      DATA,
      'demo',
      Array.from({ length: 80 }, (_, i) => (i * 7) % 11),
    );
    let step = newGame(DATA, 'demo');
    for (const a of actions) step = applyGameAction(step, a, DATA);
    expect(replayGame(DATA, 'demo', actions)).toEqual(step);
  });

  it('un cliente tramposo que inventa acciones es rechazado', () => {
    expect(() =>
      replayGame(DATA, 'demo', [
        { type: 'follow', index: 0 },
        { type: 'combat', action: { type: 'resolve', trophy: 'Horn' } },
      ]),
    ).toThrow();
  });

  it('Property: cualquier partida honesta respeta HPie, espacios de trofeos y determinismo', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.nat({ max: 20 }), { minLength: 1, maxLength: 120 }),
        (seed, choices) => {
          const actions = autoplay(DATA, seed, choices);
          let s = newGame(DATA, seed);
          for (const a of actions) {
            s = applyGameAction(s, a, DATA);
            expect(s.hp).toBeGreaterThanOrEqual(0);
            expect(s.hp).toBeLessThanOrEqual(s.maxHp);
            expect(s.trophies.length).toBeLessThanOrEqual(trophyCapacity(s, DATA));
            expect(s.items.length).toBeLessThanOrEqual(CONFIG.town.maxItems);
          }
          expect(replayGame(DATA, seed, actions)).toEqual(s);
        },
      ),
      { numRuns: 150 },
    );
  });
});
