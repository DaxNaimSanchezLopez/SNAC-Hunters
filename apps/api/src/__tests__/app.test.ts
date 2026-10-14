// Tests de integración: envío de puntuaciones validado en servidor + configuración real de config/.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyAction,
  availableDice,
  loadTutorial,
  startCombat,
  validSlotsFor,
} from '@snac-hunters/engine';
import rawTutorial from '@snac-hunters/config/tutorial.json';
import type { CombatAction, CombatState } from '@snac-hunters/engine';
import { handleRequest } from '../app.js';
import { diceTable, monsters, serverSetup } from '../game.js';
import { MemoryStore } from '../store.js';

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
});

const post = (path: string, body: unknown) =>
  handleRequest({ method: 'POST', path, body: JSON.stringify(body), userId: 'u1' }, store);

/** Simula a un cliente honesto: asigna todo lo que pueda y resuelve. */
function playHonestly(
  monsterId: string,
  seed: string,
): { actions: CombatAction[]; final: CombatState } {
  const monster = monsters.find((m) => m.id === monsterId)!;
  let s = startCombat(monster, serverSetup, seed, diceTable);
  const actions: CombatAction[] = [];
  const doAct = (a: CombatAction) => {
    s = applyAction(s, a, diceTable);
    actions.push(a);
  };
  for (const die of availableDice(s)) {
    const slot = validSlotsFor(s, die.id)[0];
    if (slot !== undefined) doAct({ type: 'assign', dieId: die.id, slot });
  }
  if (s.status === 'active') {
    if (s.assignments.every((a) => a === null))
      doAct({ type: 'reroll', dieIds: [availableDice(s)[0]!.id] });
    if (s.status === 'active' && s.assignments.some((a) => a !== null)) {
      doAct({ type: 'resolve', trophy: monster.trophies[0] });
    }
  }
  return { actions, final: s };
}

describe('config/ real', () => {
  it('los 9 monstruos de Sherbert Forest, la tabla de dados y game.json son válidos', () => {
    expect(monsters).toHaveLength(9);
    expect(Object.keys(diceTable)).toHaveLength(6);
    expect(serverSetup.hp).toBeLessThanOrEqual(serverSetup.maxHp);
    expect(loadTutorial(rawTutorial).length).toBeGreaterThan(0);
  });
});

describe('POST /runs', () => {
  it('re-simula seed + acciones y guarda el resultado calculado por el servidor', async () => {
    const { actions, final } = playHonestly('garden-salaad', 'demo-1');
    const res = await post('/runs', { monsterId: 'garden-salaad', seed: 'demo-1', actions });
    if (final.status === 'resolved') {
      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({ valid: true, outcome: final.outcome, userId: 'u1' });
      expect(store.runs).toHaveLength(1);
    } else {
      expect(res.statusCode).toBe(422);
    }
  });

  it('rechaza un combate sin terminar', async () => {
    const res = await post('/runs', { monsterId: 'garden-salaad', seed: 'x', actions: [] });
    expect(res).toMatchObject({ statusCode: 422, body: { valid: false } });
    expect(store.runs).toHaveLength(0);
  });

  it('rechaza un cliente tramposo que inventa una asignación ilegal', async () => {
    const actions = [
      { type: 'assign', dieId: 'd0', slot: 0 },
      { type: 'assign', dieId: 'd0', slot: 1 },
      { type: 'resolve', trophy: 'Claw' },
    ];
    const res = await post('/runs', { monsterId: 'garden-salaad', seed: 'x', actions });
    expect(res.statusCode).toBe(422);
    expect(store.runs).toHaveLength(0);
  });

  it('ignora resultados que el cliente intente imponer', async () => {
    const { actions } = playHonestly('beeholder', 'seed-2');
    const res = await post('/runs', {
      monsterId: 'beeholder',
      seed: 'seed-2',
      actions,
      outcome: 'defeat',
      points: 999,
    });
    expect((res.body as { points?: number }).points).not.toBe(999);
  });

  it('valida el payload: JSON roto, monstruo inexistente, acciones desconocidas', async () => {
    const broken = await handleRequest(
      { method: 'POST', path: '/runs', body: '{oops', userId: 'u1' },
      store,
    );
    expect(broken.statusCode).toBe(400);
    expect((await post('/runs', { monsterId: 'nope', seed: 'x', actions: [] })).statusCode).toBe(
      404,
    );
    expect(
      (await post('/runs', { monsterId: 'beeholder', seed: 'x', actions: [{ type: 'win' }] }))
        .statusCode,
    ).toBe(400);
  });
});

describe('analítica', () => {
  it('POST /events guarda eventos y GET /stats los resume', async () => {
    const res = await post('/events', {
      sessionId: 's1',
      events: [
        { type: 'session_start', at: 1 },
        { type: 'monster_seen', at: 2, data: { monsterId: 'porkchop' } },
      ],
    });
    expect(res.statusCode).toBe(202);
    const stats = await handleRequest(
      { method: 'GET', path: '/stats', body: null, userId: 'u1' },
      store,
    );
    expect(stats.body).toMatchObject({
      sessions: 1,
      events: { session_start: 1, monster_seen: 1 },
    });
  });

  it('rechaza lotes de eventos inválidos', async () => {
    expect((await post('/events', { sessionId: 's1', events: [] })).statusCode).toBe(400);
  });
});

describe('rutas', () => {
  it('GET /health y 404', async () => {
    expect(
      (await handleRequest({ method: 'GET', path: '/health/', body: null, userId: 'u1' }, store))
        .statusCode,
    ).toBe(200);
    expect(
      (await handleRequest({ method: 'DELETE', path: '/runs', body: null, userId: 'u1' }, store))
        .statusCode,
    ).toBe(404);
  });
});
