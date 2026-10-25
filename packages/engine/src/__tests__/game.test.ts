// RF-15: Partida — V0 (pueblo, trofeos como dinero, habilidades) y V1 (mapa, jefe, vidas,
// Pieland, misión secreta, puntaje final).
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { availableDice, canRerollAny, coveredSlots, validSlotsFor } from '../combat.js';
import type { CombatState } from '../combat.js';
import {
  applyGameAction,
  BOSS_NODE,
  finalScore,
  newGame,
  nodeMonster,
  reachableNodes,
  readyAbilities,
  replayGame,
  scoreBreakdown,
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
  QUESTS,
  V1_ABILITIES,
} from './fixtures.js';

const DATA: GameData = {
  config: CONFIG,
  monsters: [GARDEN_SALAAD, PORCUPINEAPPLE, BEEHOLDER],
  abilities: [...ABILITIES, ...V1_ABILITIES],
  quests: QUESTS,
  dice: DICE,
};

/** Datos con dados trucados: cualquier dado sale siempre con el mismo símbolo. */
function rigged(overrides: Parameters<typeof fixedTable>[0]): GameData {
  return { ...DATA, dice: fixedTable(overrides) as DiceTable };
}

function run(state: GameState, actions: readonly GameAction[], data = DATA): GameState {
  return actions.reduce((s, a) => applyGameAction(s, a, data), state);
}

/** Estado de partida con valores arbitrarios para probar casos concretos. */
function withState(patch: Partial<GameState>, data = DATA): GameState {
  return { ...newGame(data, 'base'), ...patch };
}

describe('nueva partida', () => {
  it('empieza en el pueblo con HPie completo, dados, 1 trofeo y 1 objeto (manual p. 7)', () => {
    const g = newGame(DATA, 'seed-1');
    expect(g).toMatchObject({
      phase: 'town',
      hp: 4,
      maxHp: 4,
      dice: ['red', 'red', 'red', 'red', 'green'],
      townActions: 2,
      skills: [],
      points: 0,
      runs: 0,
    });
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
  it('descansar recarga los objetos, da un trofeo y gasta una acción', () => {
    const g = withState({ items: [{ id: 'extra-ammo', ready: false }], trophies: [] });
    const r = applyGameAction(g, { type: 'rest' }, DATA);
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
        ...DATA.abilities,
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
    const items = DATA.abilities
      .filter((a) => a.kind === 'item')
      .map((a) => ({
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

/** Primer nodo al que se puede ir desde la posición actual del mapa. */
function firstNode(state: GameState): string {
  return reachableNodes(state)[0] as string;
}

/** Sale del pueblo y entra al primer nodo del mapa. */
function enterFight(state: GameState, data = DATA): GameState {
  const out = applyGameAction(state, { type: 'leave' }, data);
  return applyGameAction(out, { type: 'follow', node: firstNode(out) }, data);
}

/** Asigna en orden todos los dados que cubran algo (cliente honesto). */
function assignAll(state: GameState, data = DATA): GameState {
  let s = state;
  for (const die of availableDice(s.combat as CombatState)) {
    const slot = validSlotsFor(s.combat as CombatState, die.id)[0];
    if (slot !== undefined) {
      s = applyGameAction(
        s,
        { type: 'combat', action: { type: 'assign', dieId: die.id, slot } },
        data,
      );
    }
  }
  return s;
}

describe('mapa de la región (estilo FTL)', () => {
  it('salir del pueblo genera un mapa: columnas conectadas y el jefe al final', () => {
    const g = applyGameAction(newGame(DATA, 's'), { type: 'leave' }, DATA);
    expect(g).toMatchObject({ phase: 'trail', runs: 1, hp: 4, position: null });
    const map = g.map!;
    expect(map.columns).toBe(2);
    const first = map.nodes.filter((n) => n.column === 0);
    const last = map.nodes.filter((n) => n.column === 1);
    expect(first).toHaveLength(2);
    expect(reachableNodes(g)).toEqual(first.map((n) => n.id));
    // Todos los nodos tienen salida y todos los de la columna 2 tienen entrada
    for (const n of first) expect(n.next.length).toBeGreaterThan(0);
    for (const n of last) {
      expect(first.some((f) => f.next.includes(n.id))).toBe(true);
      expect(n.next).toEqual([BOSS_NODE]);
    }
    // El monstruo oculto de cada nodo es de su tipo (si hay monstruos de ese tipo)
    for (const n of map.nodes) {
      const monster = DATA.monsters.find((m) => m.id === n.monsterId)!;
      if (DATA.monsters.some((m) => m.type === n.type)) expect(monster.type).toBe(n.type);
    }
  });

  it('el mapa cambia en cada expedición', () => {
    const once = applyGameAction(newGame(DATA, 's'), { type: 'leave' }, DATA);
    const twice = run(once, [{ type: 'return' }, { type: 'leave' }]);
    expect(twice.map).not.toEqual(once.map);
  });

  it('solo se puede ir a nodos conectados; el monstruo se revela al entrar', () => {
    const out = applyGameAction(newGame(DATA, 's'), { type: 'leave' }, DATA);
    const node = out.map!.nodes.find((n) => n.column === 1)!;
    expect(() => applyGameAction(out, { type: 'follow', node: node.id }, DATA)).toThrow(
      /No hay camino/,
    );
    const target = firstNode(out);
    const g = applyGameAction(out, { type: 'follow', node: target }, DATA);
    expect(g).toMatchObject({ phase: 'combat', position: target });
    expect(g.combat?.monster.id).toBe(nodeMonster(out, DATA, target).id);
    expect(() => applyGameAction(g, { type: 'follow', node: target }, DATA)).toThrow(/fase/);
  });

  it('después de pelear se sigue por los caminos del nodo actual', () => {
    const data = rigged({ red: 'wild', green: 'wild' });
    const g = assignAll(enterFight(withState({ trophies: [] }, data), data), data);
    const won = applyGameAction(
      g,
      { type: 'combat', action: { type: 'resolve', trophy: g.combat!.monster.trophies[0] } },
      data,
    );
    const back = applyGameAction(won, { type: 'continue' }, data);
    const here = back.map!.nodes.find((n) => n.id === back.position)!;
    expect(back.phase).toBe('trail');
    expect(reachableNodes(back)).toEqual([...here.next]);
  });
});

describe('expedición', () => {
  it('seguir un nodo empieza el combate con trofeos y habilidades', () => {
    const g = enterFight(
      withState({ trophies: ['Claw'], items: [{ id: 'extra-ammo', ready: true }] }),
    );
    expect(g.combat?.trophies).toEqual(['Claw']);
    expect(g.combat?.abilities.map((a) => a.id)).toEqual(['extra-ammo']);
  });

  it('derrotar da puntos y trofeo; los dados usados no vuelven en el siguiente combate', () => {
    const data: GameData = {
      ...rigged({ red: 'wild', green: 'wild' }),
      monsters: [GARDEN_SALAAD, BEEHOLDER],
    };
    const g0 = enterFight(withState({ trophies: [] }, data), data);
    const monster = g0.combat!.monster;
    const g1 = run(
      assignAll(g0, data),
      [{ type: 'combat', action: { type: 'resolve', trophy: monster.trophies[0] } }],
      data,
    );
    expect(g1).toMatchObject({ phase: 'aftermath', points: 1, fights: 1, outcomes: { defeat: 1 } });
    expect(g1.trophies).toEqual([monster.trophies[0]]);
    expect(g1.defeated).toEqual([monster.type]);
    expect(g1.run?.pool).toEqual(['green']);
    const g2 = applyGameAction(g1, { type: 'continue' }, data);
    const g3 = applyGameAction(g2, { type: 'follow', node: firstNode(g2) }, data);
    expect(g3.combat?.dice.map((d) => d.kind)).toEqual(['green']);
  });

  it('huir termina la expedición: solo se puede volver al pueblo', () => {
    const data = rigged({ red: 'wild', green: 'wild' });
    const g = run(
      enterFight(withState({}, data), data),
      [
        { type: 'combat', action: { type: 'assign', dieId: 'd0', slot: 0 } },
        { type: 'combat', action: { type: 'resolve' } },
      ],
      data,
    );
    expect(g.run?.endedBy).toBe('flee');
    expect(() => applyGameAction(g, { type: 'continue' }, data)).toThrow(/terminó/);
    const t = applyGameAction(g, { type: 'return' }, data);
    expect(t).toMatchObject({ phase: 'town', run: null, map: null, hp: 4, townActions: 2 });
  });

  it('se puede volver al pueblo desde el mapa sin pelear', () => {
    const g = run(newGame(DATA, 's'), [{ type: 'leave' }, { type: 'return' }]);
    expect(g).toMatchObject({ phase: 'town', runs: 1 });
  });

  it('un objeto usado queda gastado hasta descansar; una destreza se puede volver a usar', () => {
    const data = rigged({ red: 'Wing', green: 'Wing' });
    const g = run(
      enterFight(
        withState({ items: [{ id: 'extra-ammo', ready: true }], skills: ['double-damage'] }, data),
        data,
      ),
      [
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
    const data = rigged({ red: 'heart', green: 'heart' });
    const g0 = enterFight(withState({ trophies: ['Claw', 'Wing'] }, data), data);
    const slot = g0.combat!.monster.slots.findIndex((s) => s === 'Claw' || s === 'all');
    const g1 = run(
      g0,
      slot >= 0
        ? [
            { type: 'combat', action: { type: 'trophy', index: 0, slot } },
            { type: 'combat', action: { type: 'resolve' } },
          ]
        : [],
      data,
    );
    if (slot >= 0) expect(g1.trophies).toEqual(['Wing']);
  });
});

describe('vidas y Pieland (V1)', () => {
  /** Expedición que termina en KO: dados que nunca cubren y blancos que siempre dañan. */
  function koRun(state: GameState, data: GameData): GameState {
    let g = enterFight(state, data);
    for (let i = 0; i < 6 && g.phase === 'combat'; i++) {
      g = applyGameAction(g, { type: 'combat', action: { type: 'reroll', dieIds: ['d0'] } }, data);
    }
    return g;
  }
  const deadly = rigged({ red: 'blank', green: 'blank', white: 'damage' });

  it('cada KO cuesta una vida y 1 punto; en el pueblo se recupera el HPie', () => {
    const g = koRun(withState({ trophies: [] }, deadly), deadly);
    expect(g).toMatchObject({ phase: 'aftermath', hp: 0, kos: 1, points: -1, lives: 2 });
    expect(g.run?.endedBy).toBe('ko');
    expect(applyGameAction(g, { type: 'return' }, deadly).hp).toBe(4);
  });

  it('sin vidas, volver lleva a game over', () => {
    const g = koRun(withState({ trophies: [], lives: 1 }, deadly), deadly);
    expect(g).toMatchObject({ lives: 0, result: 'lives' });
    expect(() => applyGameAction(g, { type: 'continue' }, deadly)).toThrow(/terminó/);
    const over = applyGameAction(g, { type: 'return' }, deadly);
    expect(over).toMatchObject({ phase: 'over', result: 'lives' });
    expect(() => applyGameAction(over, { type: 'rest' }, deadly)).toThrow(/terminó/);
  });

  it('cada expedición sin vencer al jefe avanza la cuenta regresiva de Pieland', () => {
    const one = run(newGame(DATA, 's'), [{ type: 'leave' }, { type: 'return' }]);
    expect(one.pieland).toEqual({ hp: 5, stage: 0, left: 5 });
    const six = withState({ pieland: { hp: 5, stage: 0, left: 1 } });
    expect(run(six, [{ type: 'leave' }, { type: 'return' }]).pieland).toEqual({
      hp: 4,
      stage: 1,
      left: 5,
    });
  });

  it('la última cuenta regresiva se repite y Pieland en 0 es game over', () => {
    const late = withState({ pieland: { hp: 2, stage: 4, left: 1 } });
    expect(run(late, [{ type: 'leave' }, { type: 'return' }]).pieland).toEqual({
      hp: 1,
      stage: 5,
      left: 2,
    });
    const last = withState({ pieland: { hp: 1, stage: 4, left: 1 } });
    expect(run(last, [{ type: 'leave' }, { type: 'return' }])).toMatchObject({
      phase: 'over',
      result: 'pieland',
    });
  });

  it('un jugador que nunca vence al jefe pierde en la expedición 20', () => {
    let g = newGame(DATA, 's');
    while (g.phase !== 'over') g = run(g, [{ type: 'leave' }, { type: 'return' }]);
    expect(g).toMatchObject({ runs: 20, result: 'pieland' });
  });

  it('abandonar la partida desde el pueblo', () => {
    expect(applyGameAction(newGame(DATA, 's'), { type: 'finish' }, DATA)).toMatchObject({
      phase: 'over',
      result: 'abandon',
    });
  });
});

describe('jefe: Pieous Assassin (V1)', () => {
  it('se sortea al empezar: 6 espacios con símbolos', () => {
    const g = newGame(DATA, 'boss');
    expect(g.boss).toMatchObject({ id: 'pieous', boss: true });
    expect(g.boss.slots).toHaveLength(6);
    expect(newGame(DATA, 'boss').boss).toEqual(g.boss);
  });

  it('derrotarlo gana la partida (y no cuenta para la cuenta regresiva)', () => {
    const data = rigged({ red: 'wild', green: 'wild' });
    const start = withState(
      { dice: ['red', 'red', 'red', 'red', 'red', 'red', 'green'], trophies: [] },
      data,
    );
    const out = applyGameAction(start, { type: 'leave' }, data);
    const atBoss: GameState = { ...out, position: out.map!.nodes.at(-1)!.id };
    const fight = applyGameAction(atBoss, { type: 'follow', node: BOSS_NODE }, data);
    expect(fight.combat?.monster.boss).toBe(true);
    const won = run(
      assignAll(fight, data),
      [{ type: 'combat', action: { type: 'resolve' } }],
      data,
    );
    expect(won).toMatchObject({ phase: 'aftermath', result: 'victory', points: 1 });
    expect(won.combat?.trophy).toBeNull();
    expect(won.defeated).toEqual([]);
    const over = applyGameAction(won, { type: 'return' }, data);
    expect(over).toMatchObject({ phase: 'over', result: 'victory' });
    expect(over.pieland).toEqual(start.pieland);
    expect(scoreBreakdown(over, data).victory).toBe(5);
  });
});

describe('Cloning Tool (V1)', () => {
  it('recarga otro objeto fuera de combate sin gastar acción', () => {
    const g = withState({
      items: [
        { id: 'cloning-tool', ready: true },
        { id: 'extra-ammo', ready: false },
      ],
    });
    const r = applyGameAction(g, { type: 'recharge', target: 'extra-ammo' }, DATA);
    expect(r.items).toEqual([
      { id: 'cloning-tool', ready: false },
      { id: 'extra-ammo', ready: true },
    ]);
    expect(r.townActions).toBe(g.townActions);
    expect(() => applyGameAction(r, { type: 'recharge', target: 'extra-ammo' }, DATA)).toThrow(
      /recarga listo/,
    );
  });

  it('rechaza recargarse a sí mismo, un objeto cargado o uno que no tienes', () => {
    const g = withState({
      items: [
        { id: 'cloning-tool', ready: true },
        { id: 'extra-ammo', ready: true },
      ],
    });
    const use = (target: string) => applyGameAction(g, { type: 'recharge', target }, DATA);
    expect(() => use('cloning-tool')).toThrow(/No tienes otro/);
    expect(() => use('nope')).toThrow(/No tienes otro/);
    expect(() => use('extra-ammo')).toThrow(/ya está cargado/);
  });
});

describe('puntaje final', () => {
  it('V0: puntos − KOs × 3 − expediciones', () => {
    const g = withState({
      points: 10,
      kos: 2,
      runs: 3,
      trophies: [],
      defeated: [],
      paid: [],
      items: [],
      skills: [],
    });
    expect(finalScore({ ...g, quest: 'longclaw' }, DATA)).toBe(10 - 6 - 3);
  });

  it('misión secreta: monstruos del tipo, trofeos pagados y trofeos guardados con sus símbolos', () => {
    const g = withState({
      quest: 'axe-and-claw',
      defeated: ['Claw', 'Claw', 'Wing'],
      paid: ['Horn', 'Tail'],
      trophies: ['Claw', 'Wing'],
      points: 0,
      runs: 0,
      items: [],
      skills: [],
    });
    // 2 monstruos Claw + 1 Horn pagado + 1 Claw guardado
    expect(scoreBreakdown(g, DATA)).toMatchObject({ quest: 4, total: 4 });
  });

  it('cartas de puntos: un punto por tipo distinto, máximo 4', () => {
    const g = withState({
      items: [{ id: 'piebix-cube', ready: false }],
      skills: ['varied-samples', 'well-traveled'],
      dice: ['red', 'orange', 'blue', 'orange'],
      trophies: ['Tail', 'Tail', 'Horn'],
      defeated: ['Horn', 'Wing', 'Claw', 'Tail', 'Horn'],
      quest: 'longclaw',
      points: 0,
      runs: 0,
      paid: [],
    });
    // 2 dados especiales distintos + 2 tipos de trofeo + 4 tipos derrotados (tope 4)
    expect(scoreBreakdown(g, DATA).cards).toBe(8);
  });

  it('los trofeos pagados en el pueblo se registran para la misión secreta', () => {
    const g = withState({ trophies: ['Horn', 'Wing'], paid: [] });
    expect(applyGameAction(g, { type: 'buy', kind: 'item', pay: [1] }, DATA).paid).toEqual([
      'Wing',
    ]);
  });

  it('rechaza acciones desconocidas', () => {
    expect(() =>
      applyGameAction(newGame(DATA, 's'), { type: 'fly' } as unknown as GameAction, DATA),
    ).toThrow(/desconocida/);
  });
});

describe('trofeos sin espacio', () => {
  it('hay que decidir qué conservar antes de seguir', () => {
    const g = withState({ trophies: ['Horn', 'Wing'], items: [], townActions: 2 });
    const r = applyGameAction(g, { type: 'rest' }, DATA);
    expect(r.pendingTrophy).not.toBeNull();
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

/** Jugador automático honesto: lo usa la validación en servidor y los tests de propiedades. */
function autoplay(data: GameData, seed: string, choices: readonly number[]): GameAction[] {
  let s = newGame(data, seed);
  const actions: GameAction[] = [];
  const act = (a: GameAction) => {
    s = applyGameAction(s, a, data);
    actions.push(a);
  };
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
      const options = reachableNodes(s);
      if (s.run && s.run.pool.length > 0 && options.length > 0 && c % 5 !== 0) {
        act({ type: 'follow', node: options[c % options.length] as string });
      } else act({ type: 'return' });
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
      const canGo =
        s.result === null && s.run?.status === 'active' && (s.run?.pool.length ?? 0) > 0;
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
      Array.from({ length: 120 }, (_, i) => (i * 7) % 11),
    );
    let step = newGame(DATA, 'demo');
    for (const a of actions) step = applyGameAction(step, a, DATA);
    expect(replayGame(DATA, 'demo', actions)).toEqual(step);
  });

  it('un cliente tramposo que inventa acciones es rechazado', () => {
    expect(() =>
      replayGame(DATA, 'demo', [{ type: 'leave' }, { type: 'follow', node: BOSS_NODE }]),
    ).toThrow(/No hay camino/);
  });

  it('Property: cualquier partida honesta respeta HPie, vidas, Pieland, trofeos y determinismo', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.nat({ max: 20 }), { minLength: 1, maxLength: 150 }),
        (seed, choices) => {
          const actions = autoplay(DATA, seed, choices);
          let s = newGame(DATA, seed);
          for (const a of actions) {
            s = applyGameAction(s, a, DATA);
            expect(s.hp).toBeGreaterThanOrEqual(0);
            expect(s.hp).toBeLessThanOrEqual(s.maxHp);
            expect(s.lives).toBeGreaterThanOrEqual(0);
            expect(s.pieland.hp).toBeGreaterThanOrEqual(0);
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
