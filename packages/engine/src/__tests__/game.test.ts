// RF-15: Partida — pueblo, misiones, expediciones, trofeos, habilidades, jefe y puntaje.
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { availableDice, canRerollAny, coveredSlots, validSlotsFor } from '../combat.js';
import {
  applyGameAction,
  BOSS_NODE,
  bossMultiplier,
  finalScore,
  canLeaveTown,
  findQuest,
  newGame,
  oldestQuest,
  payableOptions,
  reachableNodes,
  readyAbilities,
  replayGame,
  scoreBreakdown,
  townOptions,
  trophyCapacity,
} from '../game.js';
import type { GameAction, GameData, GameState, QuestSlot } from '../game.js';
import type { DiceTable, DieKind } from '../types.js';
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
  config: CONFIG,
  monsters: [GARDEN_SALAAD, PORCUPINEAPPLE, BEEHOLDER],
  abilities: ABILITIES,
  secretQuests: SECRET_QUESTS,
  quests: QUESTS,
  dice: DICE,
};

/** Datos con dados trucados: cualquier dado sale siempre con el mismo símbolo. */
function rigged(overrides: Parameters<typeof fixedTable>[0]): GameData {
  return { ...DATA, dice: fixedTable(overrides) as DiceTable };
}

/** Comodines en todos los dados y solo monstruos sin espacio de daño. */
const WILDS: GameData = {
  ...rigged({ red: 'wild', green: 'wild' }),
  monsters: [GARDEN_SALAAD, BEEHOLDER],
};

function run(state: GameState, actions: readonly GameAction[], data = DATA): GameState {
  return actions.reduce((s, a) => applyGameAction(s, a, data), state);
}

/** Partida recién empezada con el cazador verde (dado especial de lupas). */
function begin(data: GameData, seed: string): GameState {
  return applyGameAction(newGame(data, seed), { type: 'start', die: 'green' }, data);
}

/**
 * El personaje en el pueblo antes de su primera expedición, con las acciones ya gastadas
 * (listo para salir). Los tests del pueblo le dan acciones con `townActions`.
 */
function townGame(data: GameData, seed: string): GameState {
  return {
    ...begin(data, seed),
    phase: 'town',
    run: null,
    map: null,
    position: null,
    runs: 0,
    townActions: 0,
  };
}

/** Primer nodo al que se puede ir ahora en el mapa. */
function nextNode(state: GameState): GameAction {
  const [node] = reachableNodes(state);
  if (node === undefined) throw new Error('test: no hay nodos alcanzables');
  return { type: 'follow', node };
}

/** Estado de partida (en el pueblo) con valores arbitrarios para probar casos concretos. */
function withState(patch: Partial<GameState>, data = DATA): GameState {
  return { ...townGame(data, 'base'), ...patch };
}

/** Tablero de misiones fijo (la primera es la más antigua). */
function board(...ids: string[]): Pick<GameState, 'quests' | 'questDeck' | 'questSerial'> {
  return {
    quests: ids.map((id, since): QuestSlot => ({ id, since })),
    questDeck: QUESTS.map((q) => q.id).filter((id) => !ids.includes(id)),
    questSerial: ids.length,
  };
}

/** Coloca dados de la reserva en los espacios libres hasta cubrir `n` y resuelve. */
function hunt(state: GameState, n: number, data: GameData): GameState {
  let s = state;
  for (let k = 0; k < n; k++) {
    const combat = s.combat!;
    const slot = combat.assignments.findIndex((a) => a === null);
    const die = availableDice(combat)[0]!;
    s = applyGameAction(
      s,
      { type: 'combat', action: { type: 'assign', dieId: die.id, slot } },
      data,
    );
  }
  const trophy = s.combat!.monster.trophies[0];
  s = applyGameAction(s, { type: 'combat', action: { type: 'resolve', trophy } }, data);
  // Sin espacio para el trofeo: se tira el nuevo
  return s.pendingTrophy ? applyGameAction(s, { type: 'keep', discard: null }, data) : s;
}

/** Expedición con muchos dados (todos comodines con WILDS) para encadenar varios combates. */
function longRun(patch: Partial<GameState> = {}, dice = 16): GameState {
  const out = run(
    withState({ trophies: [], items: [], ...patch }, WILDS),
    [{ type: 'leave' }],
    WILDS,
  );
  const pool: DieKind[] = Array.from({ length: dice }, () => 'red');
  return { ...out, run: { ...out.run!, pool } };
}

describe('nueva partida', () => {
  it('primero se elige el color del cazador: su dado especial', () => {
    const g = newGame(DATA, 'seed-1');
    expect(g).toMatchObject({ phase: 'setup', dice: ['red', 'red', 'red', 'red'], runs: 0 });
    expect(() => applyGameAction(g, { type: 'follow', node: 'c0n0' }, DATA)).toThrow(/fase/);
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

  it('la misión secreta se entrega al elegir el color: la primera ofrecida o una de dos', () => {
    const g = newGame(DATA, 'seed-1');
    expect(g.secretOffer).toHaveLength(2);
    expect(new Set(g.secretOffer).size).toBe(2);
    expect(g.secretQuest).toBeNull();
    const first = applyGameAction(g, { type: 'start', die: 'green' }, DATA);
    expect(first.secretQuest).toBe(g.secretOffer[0]);
    const chosen = applyGameAction(
      g,
      { type: 'start', die: 'green', quest: g.secretOffer[1] },
      DATA,
    );
    expect(chosen.secretQuest).toBe(g.secretOffer[1]);
    const other = SECRET_QUESTS.find((q) => !g.secretOffer.includes(q.id))!;
    expect(() =>
      applyGameAction(g, { type: 'start', die: 'green', quest: other.id }, DATA),
    ).toThrow(/no es una de las misiones secretas/);
  });

  it('después empieza de expedición (la caza va primero) con HPie completo, dados, 1 trofeo y 1 objeto', () => {
    const g = begin(DATA, 'seed-1');
    expect(g).toMatchObject({
      phase: 'trail',
      hp: 4,
      maxHp: 4,
      dice: ['red', 'red', 'red', 'red', 'green'],
      skills: [],
      runs: 1,
      chain: 0,
      runHuntPoints: 0,
    });
    expect(g.run).toMatchObject({ hp: 4, pool: ['red', 'red', 'red', 'red', 'green'], fights: 0 });
    expect(g.map?.columns).toBe(CONFIG.map.columns);
    expect(reachableNodes(g).length).toBeGreaterThanOrEqual(2);
    expect(g).toMatchObject({ lives: 3, pieland: { hp: 5, stage: 0, left: 6 }, result: null });
    expect(() => applyGameAction(g, { type: 'rest' }, DATA)).toThrow(/fase/);
    expect(g.trophies).toHaveLength(1);
    expect(g.items).toHaveLength(1);
    expect(g.items[0]?.ready).toBe(true);
    expect(DATA.abilities.find((a) => a.id === g.items[0]?.id)?.kind).toBe('item');
  });

  it('el tablero empieza con 3 misiones: al menos una de aldeano y una del Huntmaster', () => {
    const g = newGame(DATA, 'seed-1');
    expect(g.quests).toHaveLength(3);
    const kinds = g.quests.map((q) => findQuest(DATA, q.id).kind);
    expect(kinds).toContain('villager');
    expect(kinds).toContain('huntmaster');
    expect(g.questDeck).toHaveLength(QUESTS.length - 3);
    expect([...g.quests.map((q) => q.id), ...g.questDeck].sort()).toEqual(
      QUESTS.map((q) => q.id).sort(),
    );
  });

  it('es determinista: misma seed, misma partida', () => {
    expect(newGame(DATA, 'x')).toEqual(newGame(DATA, 'x'));
  });
});

describe('pueblo', () => {
  it('descansar sana, recarga los objetos, da un trofeo y gasta una acción', () => {
    const g = withState({
      items: [{ id: 'extra-ammo', ready: false }],
      trophies: [],
      hp: 1,
      townActions: 2,
    });
    const r = applyGameAction(g, { type: 'rest' }, DATA);
    expect(r.hp).toBe(4);
    expect(r.items).toEqual([{ id: 'extra-ammo', ready: true }]);
    expect(r.trophies).toHaveLength(1);
    expect(r.townActions).toBe(1);
    // Cada opción, una vez por visita (se muestra en gris)
    expect(() => applyGameAction(r, { type: 'rest' }, DATA)).toThrow(/Ya elegiste/);
    expect(townOptions(r, DATA).rest).toEqual({ unlocked: true, used: true, available: false });
    const r2 = {
      ...r,
      townActions: 0,
      ...board('v-horn', 'h-two', 'v-claw'),
      trophies: ['Horn' as const],
    };
    expect(() => applyGameAction(r2, { type: 'quest', id: 'v-horn', pay: 'Horn' }, DATA)).toThrow(
      /No te quedan acciones/,
    );
  });

  it('misión de aldeano: se paga con UNO de sus trofeos y se elige 1 de 3 objetos', () => {
    const g = withState({
      items: [{ id: 'extra-ammo', ready: true }],
      trophies: ['Horn', 'Wing'],
      townActions: 2,
      ...board('v-horn', 'h-two', 'v-claw'),
    });
    expect(payableOptions(g, findQuest(DATA, 'v-horn'))).toEqual(['Horn', 'Wing']);
    expect(() => applyGameAction(g, { type: 'quest', id: 'v-horn' }, DATA)).toThrow(
      /No tienes lo que pide/,
    );
    expect(() => applyGameAction(g, { type: 'quest', id: 'v-horn', pay: 'Claw' }, DATA)).toThrow(
      /No tienes lo que pide/,
    );
    expect(() => applyGameAction(g, { type: 'quest', id: 'v-wing', pay: 'Wing' }, DATA)).toThrow(
      /no está en el tablero/,
    );
    const b = applyGameAction(g, { type: 'quest', id: 'v-horn', pay: 'Wing' }, DATA);
    expect(b.trophies).toEqual(['Horn']);
    expect(b.townActions).toBe(1);
    expect(b.offer?.kind).toBe('item');
    expect(b.offer?.ids).toHaveLength(3);
    expect(b.offer?.ids).not.toContain('extra-ammo');
    // La misión se retira y otra toma su lugar de inmediato (la más nueva)
    expect(b.completedQuests).toEqual(['v-horn']);
    expect(b.quests[0]).toEqual({ id: g.questDeck[0], since: 3 });
    expect(b.quests).toHaveLength(3);
    // Mientras haya cartas ofrecidas no se puede hacer otra cosa
    expect(() => applyGameAction(b, { type: 'leave' }, DATA)).toThrow(/elige una/);
    expect(() => applyGameAction(b, { type: 'rest' }, DATA)).toThrow(/elige una/);
    const chosen = b.offer?.ids[0] as string;
    const p = applyGameAction(b, { type: 'pick', abilityId: chosen }, DATA);
    expect(p.items.map((i) => i.id)).toEqual(['extra-ammo', chosen]);
    expect(p.offer).toBeNull();
  });

  it('un corazón de la misión se paga con HPie, nunca hasta quedar KO', () => {
    const g = withState({ trophies: [], hp: 3, townActions: 2, ...board('v-claw', 'h-two') });
    const quest = findQuest(DATA, 'v-claw');
    expect(payableOptions(g, quest)).toEqual(['heart']);
    const b = applyGameAction(g, { type: 'quest', id: 'v-claw', pay: 'heart' }, DATA);
    expect(b.hp).toBe(2);
    expect(payableOptions({ ...g, hp: 1 }, quest)).toEqual([]);
    expect(townOptions({ ...g, hp: 1 }, DATA).item.available).toBe(false);
  });

  it('misión del Huntmaster: pide TODOS sus trofeos y corazones y da a elegir una destreza', () => {
    const g = withState({
      trophies: ['Horn', 'Claw'],
      hp: 3,
      skills: [],
      townActions: 2,
      ...board('h-two', 'h-hearts', 'v-horn'),
    });
    expect(payableOptions(g, findQuest(DATA, 'h-two'))).toEqual([]);
    expect(() => applyGameAction(g, { type: 'quest', id: 'h-two' }, DATA)).toThrow(
      /No tienes lo que pide/,
    );
    const b = applyGameAction(g, { type: 'quest', id: 'h-hearts' }, DATA);
    expect(b).toMatchObject({ hp: 1, trophies: ['Horn'] });
    expect(b.offer?.kind).toBe('skill');
    // Con 2 HPie no alcanza: pagar 2 corazones lo dejaría KO
    expect(payableOptions({ ...g, hp: 2 }, findQuest(DATA, 'h-hearts'))).toEqual([]);
    const offered: GameState = { ...b, offer: { kind: 'skill', ids: ['pierfect-shot'] } };
    const p = applyGameAction(offered, { type: 'pick', abilityId: 'pierfect-shot' }, DATA);
    expect(p.skills).toEqual(['pierfect-shot']);
    expect(p.dice).toEqual(['red', 'red', 'red', 'red', 'green', 'blue']);
  });

  it('no se puede rechazar la oferta: hay que quedarse con una carta', () => {
    const g = withState({ items: [], trophies: ['Horn'], townActions: 2, ...board('v-horn') });
    const b = applyGameAction(g, { type: 'quest', id: 'v-horn', pay: 'Horn' }, DATA);
    const decline = { type: 'pick', abilityId: null } as unknown as GameAction;
    expect(() => applyGameAction(b, decline, DATA)).toThrow(/no está entre/);
    expect(canLeaveTown(b, DATA)).toBe(false);
  });

  it('para salir hay que gastar las 2 acciones, salvo que no quede ninguna opción posible', () => {
    const g = withState({ trophies: [], townActions: 2, ...board('v-wing', 'h-two') });
    expect(canLeaveTown(g, DATA)).toBe(false);
    expect(() => applyGameAction(g, { type: 'leave' }, DATA)).toThrow(/antes de salir/);
    const rested = applyGameAction(g, { type: 'rest' }, DATA);
    // Ya descansó y no tiene con qué cumplir una misión: puede salir con una acción sin usar
    expect(canLeaveTown({ ...rested, trophies: [] }, DATA)).toBe(true);
    // Con un trofeo que pide una misión, todavía le queda algo por hacer
    const wing: GameState = { ...rested, trophies: ['Wing'] };
    expect(canLeaveTown(wing, DATA)).toBe(false);
    const paid = applyGameAction(wing, { type: 'quest', id: 'v-wing', pay: 'Wing' }, DATA);
    const done = applyGameAction(paid, { type: 'pick', abilityId: paid.offer!.ids[0]! }, DATA);
    expect(canLeaveTown(done, DATA)).toBe(true);
    expect(applyGameAction(done, { type: 'leave' }, DATA).phase).toBe('trail');
  });

  it('partida guiada: el pueblo empieza con 2 opciones y suma una en cada regreso', () => {
    const g = applyGameAction(
      newGame(DATA, 'guided'),
      { type: 'start', die: 'green', guided: true },
      DATA,
    );
    const returned = applyGameAction(g, { type: 'return' }, DATA);
    const first: GameState = { ...returned, trophies: ['Horn', 'Wing'], ...board('h-two') };
    expect(first.townVisits).toBe(1);
    const options = townOptions(first, DATA);
    expect(options.rest.unlocked && options.item.unlocked).toBe(true);
    expect(options.skill).toMatchObject({ unlocked: false, available: false });
    expect(() => applyGameAction(first, { type: 'quest', id: 'h-two' }, DATA)).toThrow(
      /aún no está disponible/,
    );
    const second = run({ ...first, townActions: 0 }, [{ type: 'leave' }, { type: 'return' }]);
    expect(second.townVisits).toBe(2);
    expect(townOptions(second, DATA).skill.unlocked).toBe(true);
    // Sin guía, las 3 opciones desde la primera visita
    const free = applyGameAction(begin(DATA, 'free'), { type: 'return' }, DATA);
    expect(townOptions(free, DATA).skill.unlocked).toBe(true);
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

  it('no se puede cumplir una misión si no quedan cartas de ese tipo', () => {
    const items = ABILITIES.filter((a) => a.kind === 'item').map((a) => ({
      id: a.id,
      ready: true,
    }));
    const g = withState({ items, trophies: ['Horn'], townActions: 2, ...board('v-horn') });
    expect(townOptions(g, DATA).item.available).toBe(false);
    expect(() => applyGameAction(g, { type: 'quest', id: 'v-horn', pay: 'Horn' }, DATA)).toThrow(
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

  it('Cloning Tool recarga otro objeto gastado, sin gastar acción', () => {
    const g = withState({
      items: [
        { id: 'cloning-tool', ready: true },
        { id: 'extra-ammo', ready: false },
      ],
      townActions: 2,
    });
    const r = applyGameAction(g, { type: 'recharge', target: 'extra-ammo' }, DATA);
    expect(r.items).toEqual([
      { id: 'cloning-tool', ready: false },
      { id: 'extra-ammo', ready: true },
    ]);
    expect(r.townActions).toBe(2);
    expect(() => applyGameAction(r, { type: 'recharge', target: 'extra-ammo' }, DATA)).toThrow(
      /recarga listo/,
    );
    expect(() => applyGameAction(g, { type: 'recharge', target: 'cloning-tool' }, DATA)).toThrow(
      /otro objeto/,
    );
  });
});

describe('tablero de misiones', () => {
  it('al volver al pueblo se retira la misión más antigua y llega una nueva', () => {
    const g = run(withState({ ...board('v-horn', 'h-two', 'v-claw') }), [{ type: 'leave' }]);
    expect(oldestQuest(g)).toBe('v-horn');
    const t = applyGameAction(g, { type: 'return' }, DATA);
    expect(t.quests.map((q) => q.id)).toEqual([g.questDeck[0], 'h-two', 'v-claw']);
    expect(t.quests[0]?.since).toBe(3);
    // La retirada no cuenta como cumplida; la siguiente en irse es la que sigue en antigüedad
    expect(t.completedQuests).toEqual([]);
    expect(oldestQuest(t)).toBe('h-two');
  });

  it('si el mazo se acaba, se rearma con las misiones que no están en el tablero', () => {
    const g = withState({
      trophies: ['Horn'],
      townActions: 2,
      quests: [{ id: 'v-horn', since: 0 }],
      questDeck: [],
      questSerial: 1,
    });
    const b = applyGameAction(g, { type: 'quest', id: 'v-horn', pay: 'Horn' }, DATA);
    expect(b.quests).toHaveLength(1);
    expect(b.quests[0]?.id).toBe('v-claw');
    expect(b.questDeck).toEqual(['h-two', 'h-hearts', 'v-wing']);
  });
});

describe('expedición', () => {
  it('salir del pueblo abre un mapa FTL nuevo: columnas de 2–3 nodos hasta el jefe', () => {
    const data: GameData = { ...DATA, config: { ...CONFIG, features: { boss: true } } };
    const g = applyGameAction(townGame(data, 's'), { type: 'leave' }, data);
    expect(g).toMatchObject({ phase: 'trail', runs: 1, hp: 4, position: null });
    const map = g.map!;
    for (let c = 0; c < map.columns; c++) {
      const column = map.nodes.filter((n) => n.column === c);
      expect(column.length).toBeGreaterThanOrEqual(CONFIG.map.minNodes);
      expect(column.length).toBeLessThanOrEqual(CONFIG.map.maxNodes);
    }
    // Cada nodo esconde un monstruo de su tipo y lleva a la siguiente columna (o al jefe)
    for (const node of map.nodes) {
      // (los monstruos de prueba no tienen tipo Cola: ese nodo esconde uno cualquiera)
      const ofType = DATA.monsters.filter((m) => m.type === node.type);
      if (ofType.length > 0) expect(ofType.map((m) => m.id)).toContain(node.monsterId);
      expect(node.next.length).toBeGreaterThan(0);
      if (node.column === map.columns - 1) expect(node.next).toEqual([BOSS_NODE]);
    }
    expect(reachableNodes(g)).toEqual(map.nodes.filter((n) => n.column === 0).map((n) => n.id));
    expect(g.run?.pool).toEqual(g.dice);
    // Sin el toggle del jefe, el mapa termina en la última columna
    const plain = applyGameAction(townGame(DATA, 's'), { type: 'leave' }, DATA);
    const last = plain.map!.nodes.filter((n) => n.column === plain.map!.columns - 1);
    expect(last.every((n) => n.next.length === 0)).toBe(true);
  });

  it('ir a un nodo revela su monstruo y empieza el combate con trofeos y habilidades', () => {
    const trail = run(
      withState({ trophies: ['Claw'], items: [{ id: 'extra-ammo', ready: true }] }),
      [{ type: 'leave' }],
    );
    const g = applyGameAction(trail, { type: 'follow', node: 'c0n1' }, DATA);
    expect(g.phase).toBe('combat');
    expect(g.position).toBe('c0n1');
    expect(g.combat?.monster.id).toBe(trail.map?.nodes.find((n) => n.id === 'c0n1')?.monsterId);
    // Solo se avanza por los caminos: nada de saltar columnas
    expect(() => applyGameAction(trail, { type: 'follow', node: 'c1n0' }, DATA)).toThrow(
      /No hay camino/,
    );
    expect(g.combat?.trophies).toEqual(['Claw']);
    expect(g.combat?.abilities.map((a) => a.id)).toEqual(['extra-ammo']);
    expect(() => applyGameAction(g, { type: 'follow', node: 'c0n0' }, DATA)).toThrow(/fase/);
  });

  it('derrotar da 10 puntos de cadena y trofeo; los dados usados no vuelven', () => {
    const g0 = run(
      withState({ trophies: [] }, WILDS),
      [{ type: 'leave' }, { type: 'follow', node: 'c0n0' }],
      WILDS,
    );
    const monster = g0.combat!.monster;
    const g1 = hunt(g0, 4, WILDS);
    expect(g1).toMatchObject({
      phase: 'aftermath',
      chain: 1,
      runHuntPoints: 10,
      fights: 1,
      outcomes: { defeat: 1 },
    });
    expect(g1.trophies).toEqual([monster.trophies[0]]);
    expect(g1.run?.pool).toEqual(['green']);
    const g2 = applyGameAction(g1, { type: 'continue' }, WILDS);
    expect(g2.phase).toBe('trail');
    expect(reachableNodes(g2)).toEqual(g2.map!.nodes.find((n) => n.id === g2.position)!.next);
    const g3 = applyGameAction(g2, nextNode(g2), WILDS);
    expect(g3.combat?.dice.map((d) => d.kind)).toEqual(['green']);
  });

  it('huir termina la expedición: solo se puede volver al pueblo', () => {
    const data = rigged({ red: 'wild', green: 'wild' });
    const g = run(
      withState({}, data),
      [
        { type: 'leave' },
        { type: 'follow', node: 'c0n1' },
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

  it('KO: no resta puntos, la expedición termina y en el pueblo se recupera el HPie', () => {
    const data = rigged({ red: 'Tail', green: 'Tail', white: 'damage' });
    let g = run(
      withState({ trophies: [] }, data),
      [{ type: 'leave' }, { type: 'follow', node: 'c0n0' }],
      data,
    );
    for (let i = 0; i < 8 && g.phase === 'combat'; i++) {
      g = applyGameAction(g, { type: 'combat', action: { type: 'reroll', dieIds: ['d0'] } }, data);
    }
    expect(g).toMatchObject({ phase: 'aftermath', hp: 0, kos: 1, runHuntPoints: 0 });
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
    const out = applyGameAction({ ...town, townActions: 0 }, { type: 'leave' }, DATA);
    expect(out.run?.hp).toBe(2);
    expect(applyGameAction(town, { type: 'rest' }, DATA).hp).toBe(4);
  });

  it('se puede volver al pueblo desde el sendero sin pelear', () => {
    const g = run(townGame(DATA, 's'), [{ type: 'leave' }, { type: 'return' }]);
    expect(g).toMatchObject({ phase: 'town', runs: 1, townActions: 2, townUsed: [] });
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
        { type: 'follow', node: 'c0n0' },
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
      [{ type: 'leave' }, { type: 'follow', node: 'c0n0' }],
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

describe('puntaje (feedback 2026-11-03)', () => {
  it('cada monstruo derrotado del run vale más que el anterior; estudiar no cambia la cadena', () => {
    const quest = SECRET_QUESTS[0]!; // Axe and Claw: monstruos de tipo Garra
    let g = longRun({ secretQuest: quest.id });
    let claws = 0;
    // Derrotar, estudiar, derrotar (las 3 columnas del mapa) = 10 + 20
    for (const covered of [4, 2, 4]) {
      if (g.phase === 'aftermath') g = applyGameAction(g, { type: 'continue' }, WILDS);
      g = applyGameAction(g, nextNode(g), WILDS);
      if (covered === 4 && g.combat!.monster.type === quest.monsterType) claws++;
      g = hunt(g, covered, WILDS);
    }
    expect(g).toMatchObject({ chain: 2, runHuntPoints: 30, runQuestKills: claws });
    // Al final del mapa (sin jefe) ya no se puede seguir
    expect(() => applyGameAction(g, { type: 'continue' }, WILDS)).toThrow(/final del mapa/);
    // Un run nuevo empieza la cadena de cero
    const town = applyGameAction(g, { type: 'return' }, WILDS);
    const next = applyGameAction({ ...town, townActions: 0 }, { type: 'leave' }, WILDS);
    expect(next).toMatchObject({ chain: 0, runHuntPoints: 0, runQuestKills: 0, runs: 2 });
  });

  it('casos de prueba del cliente (jefe derrotado)', () => {
    const final = (
      runs: number,
      hunt: number,
      kills: number,
      trophies: GameState['trophies'],
      hp: number,
    ) =>
      finalScore(
        withState({
          bossDefeated: true,
          runs,
          runHuntPoints: hunt,
          runQuestKills: kills,
          trophies,
          secretQuest: 'axe-and-claw',
          hp,
        }),
        DATA,
      );
    // A: (450 + 50) × 2.0; B: (280 + 70) × 1.5; C: (360 + 100) × 1.25
    expect(final(4, 450, 2, ['Horn', 'Tail'], 2)).toBe(1000);
    expect(final(6, 280, 2, ['Horn', 'Claw'], 3)).toBe(525);
    expect(final(10, 360, 2, ['Claw', 'Claw'], 6)).toBe(575);
  });

  it('multiplicador del jefe: 2 / 1.75 / 1.5 y se detiene en 1.25', () => {
    expect([1, 4, 5, 6, 7, 12].map((r) => bossMultiplier(r, CONFIG))).toEqual([
      2, 2, 1.75, 1.5, 1.25, 1.25,
    ]);
  });

  it('partida sin terminar: el puntaje es el del mejor run, sin HPie ni multiplicador', () => {
    const g = withState({
      runs: 2,
      run: { hp: 3, maxHp: 4, pool: [], fights: 3, status: 'active', endedBy: null },
      phase: 'aftermath',
      runHuntPoints: 60,
      runQuestKills: 1,
      trophies: ['Horn', 'Wing'],
      secretQuest: 'axe-and-claw',
      hp: 3,
    });
    expect(scoreBreakdown(g, DATA)).toMatchObject({
      final: false,
      hunt: 60,
      questKills: 1,
      questTrophies: 1,
      hp: 0,
      multiplier: 1,
      total: 80,
    });
    // El run a medias ya cuenta; al volver al pueblo queda guardado como el mejor
    expect(finalScore(g, DATA)).toBe(80);
    const town = applyGameAction(g, { type: 'return' }, DATA);
    expect(town.bestRun).toMatchObject({ run: 2, total: 80 });
    expect(finalScore(town, DATA)).toBe(80);
    // Un run peor no lo reemplaza
    const worse = run({ ...town, townActions: 0 }, [{ type: 'leave' }, { type: 'return' }]);
    expect(worse.bestRun?.total).toBe(80);
  });

  it('las cartas de puntos suman 10 por cada tipo distinto', () => {
    const g = withState({
      skills: ['varied-samples'],
      trophies: ['Horn', 'Wing', 'Claw'],
      secretQuest: 'axe-and-claw',
    });
    expect(scoreBreakdown(g, DATA)).toMatchObject({ cards: 30, questTrophies: 2, total: 50 });
  });
});

describe('jefe', () => {
  const BOSS_ON: GameData = {
    ...WILDS,
    config: { ...CONFIG, features: { boss: true } },
  };

  /** Expedición con muchos dados (comodines), jefe encendido y el mapa ya generado. */
  function bossRun(patch: Partial<GameState> = {}): GameState {
    const out = run(
      withState({ trophies: [], items: [], ...patch }, BOSS_ON),
      [{ type: 'leave' }],
      BOSS_ON,
    );
    const pool: DieKind[] = Array.from({ length: 30 }, () => 'red');
    return { ...out, run: { ...out.run!, pool } };
  }

  it('la guarida del jefe está al final del mapa: solo se llega por los caminos', () => {
    let s = bossRun();
    expect(() => applyGameAction(s, { type: 'follow', node: BOSS_NODE }, BOSS_ON)).toThrow(
      /No hay camino/,
    );
    for (let c = 0; c < CONFIG.map.columns; c++) {
      if (s.phase === 'aftermath') s = applyGameAction(s, { type: 'continue' }, BOSS_ON);
      s = hunt(applyGameAction(s, nextNode(s), BOSS_ON), 2, BOSS_ON);
    }
    s = applyGameAction(s, { type: 'continue' }, BOSS_ON);
    expect(reachableNodes(s)).toEqual([BOSS_NODE]);
    const fight = applyGameAction(s, { type: 'follow', node: BOSS_NODE }, BOSS_ON);
    expect(fight.combat?.monster).toMatchObject({ id: 'pieous', boss: true });
    expect(fight.combat?.monster.slots).toHaveLength(6);
  });

  it('derrotar al jefe termina la partida con el puntaje final', () => {
    let s = { ...bossRun({ secretQuest: 'axe-and-claw', trophies: ['Claw'] }), runs: 5 };
    // Una columna derrotando y dos estudiando: cadena 1 antes del jefe
    for (const covered of [4, 2, 2]) {
      if (s.phase === 'aftermath') s = applyGameAction(s, { type: 'continue' }, BOSS_ON);
      s = hunt(applyGameAction(s, nextNode(s), BOSS_ON), covered, BOSS_ON);
    }
    s = applyGameAction(s, { type: 'continue' }, BOSS_ON);
    s = hunt(applyGameAction(s, { type: 'follow', node: BOSS_NODE }, BOSS_ON), 6, BOSS_ON);
    expect(s).toMatchObject({
      phase: 'over',
      result: 'victory',
      bossDefeated: true,
      chain: 2,
      runHuntPoints: 30,
    });
    const score = scoreBreakdown(s, BOSS_ON);
    expect(score).toMatchObject({ final: true, hp: 4, multiplier: 1.75 });
    expect(finalScore(s, BOSS_ON)).toBe(score.total);
    expect(() => applyGameAction(s, { type: 'return' }, BOSS_ON)).toThrow(/terminó/);
  });
});

describe('vidas y Pieland (V1)', () => {
  it('cada KO cuesta una vida; sin vidas la partida termina al volver al pueblo', () => {
    const data = rigged({ red: 'Tail', green: 'Tail', white: 'damage' });
    const ko = (state: GameState): GameState => {
      let g = applyGameAction(state, { type: 'follow', node: 'c0n0' }, data);
      for (let i = 0; i < 8 && g.phase === 'combat'; i++) {
        g = applyGameAction(
          g,
          { type: 'combat', action: { type: 'reroll', dieIds: ['d0'] } },
          data,
        );
      }
      return g;
    };
    const g = ko(run(withState({ trophies: [], lives: 2 }, data), [{ type: 'leave' }], data));
    expect(g).toMatchObject({ lives: 1, result: null, kos: 1 });
    const town = applyGameAction(g, { type: 'return' }, data);
    expect(town.phase).toBe('town');
    const last = ko(applyGameAction({ ...town, townActions: 0 }, { type: 'leave' }, data));
    expect(last).toMatchObject({ phase: 'aftermath', lives: 0, result: 'lives' });
    expect(() => applyGameAction(last, { type: 'continue' }, data)).toThrow(/terminó/);
    const over = applyGameAction(last, { type: 'return' }, data);
    expect(over).toMatchObject({ phase: 'over', result: 'lives' });
    expect(over.bestRun).not.toBeNull();
  });

  it('cuenta regresiva 6/5/4/3/2: al agotarse, Pieland pierde 1 PV; en 0, fin de la partida', () => {
    const back = (g: GameState) =>
      run({ ...g, townActions: 0 }, [{ type: 'leave' }, { type: 'return' }]);
    let g = withState({});
    const seen: [number, number][] = [];
    for (let i = 0; i < 20 && g.phase === 'town'; i++) {
      g = back(g);
      seen.push([g.pieland.hp, g.pieland.left]);
    }
    expect(seen.slice(0, 7)).toEqual([
      [5, 5],
      [5, 4],
      [5, 3],
      [5, 2],
      [5, 1],
      [4, 5],
      [4, 4],
    ]);
    // 6 + 5 + 4 + 3 + 2 = 20 expediciones sin derrotar al jefe
    expect(seen).toHaveLength(20);
    expect(g).toMatchObject({ phase: 'over', result: 'pieland', pieland: { hp: 0 } });
  });

  it('dejar la partida la marca como abandonada', () => {
    const over = applyGameAction(townGame(DATA, 's'), { type: 'finish' }, DATA);
    expect(over.result).toBe('abandon');
  });
});

describe('fin de partida', () => {
  it('terminar desde el pueblo o a mitad de una expedición; después no se acepta nada', () => {
    const over = applyGameAction(townGame(DATA, 's'), { type: 'finish' }, DATA);
    expect(over.phase).toBe('over');
    expect(() => applyGameAction(over, { type: 'rest' }, DATA)).toThrow(/terminó/);
    const trail = applyGameAction(townGame(DATA, 's'), { type: 'leave' }, DATA);
    const quit = applyGameAction(trail, { type: 'finish' }, DATA);
    expect(quit).toMatchObject({ phase: 'over', run: null });
    expect(quit.bestRun).toMatchObject({ run: 1 });
    const fighting = applyGameAction(trail, nextNode(trail), DATA);
    expect(() => applyGameAction(fighting, { type: 'finish' }, DATA)).toThrow(/fase/);
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
  /** Primera misión del tablero de ese tipo que se puede pagar ahora. */
  const questFor = (kind: 'villager' | 'huntmaster'): GameAction | null => {
    for (const slot of s.quests) {
      const quest = findQuest(data, slot.id);
      const [pay] = payableOptions(s, quest);
      if (quest.kind === kind && pay !== undefined) return { type: 'quest', id: quest.id, pay };
    }
    return null;
  };
  const colors = ['orange', 'blue', 'purple', 'green'] as const;
  act({
    type: 'start',
    die: colors[(choices[0] ?? 0) % colors.length]!,
    quest: s.secretOffer[(choices[0] ?? 0) % 2],
  });
  for (const c of choices) {
    if (s.phase === 'over') break;
    if (s.pendingTrophy !== null) act({ type: 'keep', discard: c % 2 === 0 ? 0 : null });
    else if (s.phase === 'town') {
      const options = townOptions(s, data);
      const villager = options.item.available ? questFor('villager') : null;
      const huntmaster = options.skill.available ? questFor('huntmaster') : null;
      if (s.offer) {
        // Siempre hay que quedarse con una carta; con 3 del mismo tipo se reemplaza la primera
        const mine = s.offer.kind === 'item' ? s.items.map((i) => i.id) : s.skills;
        const max = s.offer.kind === 'item' ? CONFIG.town.maxItems : CONFIG.town.maxSkills;
        const replace = mine.length >= max ? mine[0] : undefined;
        act({ type: 'pick', abilityId: s.offer.ids[0]!, ...(replace ? { replace } : {}) });
      } else if (options.rest.available && c % 2 === 0) act({ type: 'rest' });
      else if (villager) act(villager);
      else if (options.rest.available) act({ type: 'rest' });
      else if (huntmaster) act(huntmaster);
      else if (c === 19) act({ type: 'finish' });
      else act({ type: 'leave' });
    } else if (s.phase === 'trail') {
      const nodes = reachableNodes(s);
      if (nodes.length > 0 && c % 5 !== 0) act({ type: 'follow', node: nodes[c % nodes.length]! });
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
        const free = availableDice(combat).find(
          (d) =>
            d.kind !== 'trophy' && d.kind !== 'token' && !(d.kind === 'white' && d.face === 'wild'),
        );
        act({
          type: 'combat',
          action: { type: 'reroll', dieIds: free && canRerollAny(combat) ? [free.id] : [] },
        });
      }
    } else if (s.phase === 'aftermath') {
      const canGo = s.run?.status === 'active' && s.result === null && reachableNodes(s).length > 0;
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
        { type: 'follow', node: 'c0n0' },
        { type: 'combat', action: { type: 'resolve', trophy: 'Horn' } },
      ]),
    ).toThrow();
  });

  it('Property: cualquier partida honesta respeta HPie, espacios de trofeos, tablero y determinismo', () => {
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
            expect(s.quests).toHaveLength(CONFIG.town.questSlots);
            expect(finalScore(s, DATA)).toBeGreaterThanOrEqual(0);
          }
          expect(replayGame(DATA, seed, actions)).toEqual(s);
        },
      ),
      { numRuns: 150 },
    );
  });
});
