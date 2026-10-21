// Tests de integración: partidas validadas en servidor + configuración real de config/.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyGameAction,
  availableDice,
  canRerollAny,
  coveredSlots,
  finalScore,
  isRollable,
  loadGuide,
  loadTutorial,
  newGame,
  validSlotsFor,
} from '@snac-hunters/engine';
import rawGuide from '@snac-hunters/config/guide.json';
import rawTutorial from '@snac-hunters/config/tutorial.json';
import type { GameAction, GameState } from '@snac-hunters/engine';
import { handleRequest } from '../app.js';
import { abilities, diceTable, gameConfig, gameData, monsters } from '../game.js';
import { MemoryStore } from '../store.js';

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
});

const post = (path: string, body: unknown) =>
  handleRequest({ method: 'POST', path, body: JSON.stringify(body), userId: 'u1' }, store);

/** Simula a un cliente honesto: una expedición, asigna lo que puede y resuelve. */
function playHonestly(seed: string): { actions: GameAction[]; final: GameState } {
  let s = newGame(gameData, seed);
  const actions: GameAction[] = [];
  const act = (a: GameAction) => {
    s = applyGameAction(s, a, gameData);
    actions.push(a);
  };
  act({ type: 'leave' });
  act({ type: 'follow', index: 0 });
  for (let guard = 0; s.phase === 'combat' && guard < 30; guard++) {
    const combat = s.combat!;
    const die = availableDice(combat).find((d) => validSlotsFor(combat, d.id).length > 0);
    if (die) {
      act({
        type: 'combat',
        action: { type: 'assign', dieId: die.id, slot: validSlotsFor(combat, die.id)[0]! },
      });
    } else if (coveredSlots(combat) > 0) {
      act({ type: 'combat', action: { type: 'resolve', trophy: combat.monster.trophies[0] } });
    } else {
      const free = availableDice(combat).find((d) => isRollable(d.kind));
      act({
        type: 'combat',
        action: { type: 'reroll', dieIds: free && canRerollAny(combat) ? [free.id] : [] },
      });
    }
  }
  if (s.pendingTrophy) act({ type: 'keep', discard: null });
  act({ type: 'return' });
  act({ type: 'finish' });
  return { actions, final: s };
}

describe('config/ real', () => {
  it('monstruos, dados, 20 habilidades, game.json, tutorial y guía son válidos', () => {
    expect(monsters).toHaveLength(9);
    expect(Object.keys(diceTable)).toHaveLength(6);
    expect(abilities.filter((a) => a.kind === 'item')).toHaveLength(12);
    expect(abilities.filter((a) => a.kind === 'skill')).toHaveLength(8);
    expect(gameConfig.player.maxHp).toBe(4);
    expect(loadTutorial(rawTutorial).length).toBeGreaterThan(0);
    expect(loadGuide(rawGuide).filter((l) => l.final)).toHaveLength(1);
  });
});

describe('POST /games', () => {
  it('re-simula seed + acciones y guarda el puntaje calculado por el servidor', async () => {
    const { actions, final } = playHonestly('demo-1');
    const res = await post('/games', { seed: 'demo-1', actions });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      valid: true,
      gameId: 'demo-1',
      userId: 'u1',
      phase: 'over',
      score: finalScore(final, gameConfig),
      runs: 1,
      fights: 1,
    });
    expect(store.games.size).toBe(1);
  });

  it('cada envío reemplaza la partida anterior con el mismo id', async () => {
    const { actions } = playHonestly('demo-2');
    await post('/games', { seed: 'demo-2', actions: actions.slice(0, 1) });
    await post('/games', { seed: 'demo-2', actions });
    expect(store.games.size).toBe(1);
    expect([...store.games.values()][0]?.phase).toBe('over');
  });

  it('rechaza un cliente tramposo que inventa una jugada ilegal', async () => {
    const actions = [
      { type: 'leave' },
      { type: 'follow', index: 0 },
      { type: 'combat', action: { type: 'assign', dieId: 'd0', slot: 0 } },
      { type: 'combat', action: { type: 'assign', dieId: 'd0', slot: 1 } },
    ];
    const res = await post('/games', { seed: 'x', actions });
    expect(res.statusCode).toBe(422);
    expect(store.games.size).toBe(0);
  });

  it('rechaza usar un trofeo o una habilidad que no se tiene', async () => {
    const steal = [
      { type: 'leave' },
      { type: 'follow', index: 0 },
      { type: 'combat', action: { type: 'trophy', index: 7, slot: 0 } },
    ];
    expect((await post('/games', { seed: 'x', actions: steal })).statusCode).toBe(422);
    const ability = [
      { type: 'leave' },
      { type: 'follow', index: 0 },
      {
        type: 'combat',
        action: { type: 'ability', abilityId: 'nope', dieIds: ['d0', 'd1', 'd2'], trophy: 'Horn' },
      },
    ];
    expect((await post('/games', { seed: 'x', actions: ability })).statusCode).toBe(422);
  });

  it('ignora resultados que el cliente intente imponer', async () => {
    const { actions } = playHonestly('seed-2');
    const res = await post('/games', { seed: 'seed-2', actions, score: 999, points: 999 });
    expect((res.body as { score: number }).score).not.toBe(999);
  });

  it('valida el payload: JSON roto, sin seed, acciones desconocidas', async () => {
    const broken = await handleRequest(
      { method: 'POST', path: '/games', body: '{oops', userId: 'u1' },
      store,
    );
    expect(broken.statusCode).toBe(400);
    expect((await post('/games', { actions: [] })).statusCode).toBe(400);
    expect((await post('/games', { seed: 'x', actions: [{ type: 'win' }] })).statusCode).toBe(400);
  });
});

describe('analítica', () => {
  it('POST /events guarda eventos y GET /stats resume eventos y partidas', async () => {
    const res = await post('/events', {
      sessionId: 's1',
      events: [
        { type: 'session_start', at: 1 },
        { type: 'monster_seen', at: 2, data: { monsterId: 'porkchop' } },
      ],
    });
    expect(res.statusCode).toBe(202);
    const { actions } = playHonestly('demo-3');
    await post('/games', { seed: 'demo-3', actions });
    const stats = await handleRequest(
      { method: 'GET', path: '/stats', body: null, userId: 'u1' },
      store,
    );
    expect(stats.body).toMatchObject({
      games: 1,
      finished: 1,
      fights: 1,
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
      (await handleRequest({ method: 'DELETE', path: '/games', body: null, userId: 'u1' }, store))
        .statusCode,
    ).toBe(404);
  });
});
