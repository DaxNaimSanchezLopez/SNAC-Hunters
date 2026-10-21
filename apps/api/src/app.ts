// Router HTTP independiente de AWS: lo usan la Lambda, el servidor local y los tests.
import { z } from 'zod';
import { CombatError, finalScore, replayGame } from '@snac-hunters/engine';
import { gameConfig, gameData, monsters } from './game.js';
import type { Store } from './store.js';

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly body: string | null;
  /** Viene del authorizer de Cognito; 'guest' en modo local. */
  readonly userId: string;
}

export interface ApiResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

const SymbolSchema = z.enum(['Horn', 'Wing', 'Claw', 'Tail']);
const DieId = z.string().max(8);
const Index = z.number().int();

const CombatActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reroll'), dieIds: z.array(DieId).max(60) }),
  z.object({ type: z.literal('assign'), dieId: DieId, slot: Index }),
  z.object({ type: z.literal('unassign'), slot: Index }),
  z.object({ type: z.literal('trophy'), index: Index, slot: Index }),
  z.object({
    type: z.literal('ability'),
    abilityId: z.string().max(64),
    dieIds: z.array(DieId).max(3),
    trophy: SymbolSchema.optional(),
  }),
  z.object({ type: z.literal('resolve'), trophy: SymbolSchema.optional() }),
]);

const GameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rest') }),
  z.object({
    type: z.literal('buy'),
    kind: z.enum(['item', 'skill']),
    pay: z.array(Index).max(10),
  }),
  z.object({
    type: z.literal('pick'),
    abilityId: z.string().max(64).nullable(),
    replace: z.string().max(64).optional(),
  }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('follow'), index: Index }),
  z.object({ type: z.literal('combat'), action: CombatActionSchema }),
  z.object({ type: z.literal('keep'), discard: Index.nullable() }),
  z.object({ type: z.literal('continue') }),
  z.object({ type: z.literal('return') }),
  z.object({ type: z.literal('finish') }),
]);

// El cliente solo envía seed + acciones de la partida; el resultado lo calcula el servidor.
const GameSubmissionSchema = z.object({
  seed: z.string().min(1).max(128),
  actions: z.array(GameActionSchema).max(5000),
});

const EventsSchema = z.object({
  sessionId: z.string().min(1).max(64),
  events: z
    .array(
      z.object({
        type: z.string().min(1).max(40),
        at: z.number().int().nonnegative(),
        data: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(100),
});

function parseJson(body: string | null): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

async function submitGame(req: ApiRequest, store: Store): Promise<ApiResponse> {
  const parsed = GameSubmissionSchema.safeParse(parseJson(req.body));
  if (!parsed.success) {
    return {
      statusCode: 400,
      body: { valid: false, error: 'Payload inválido', issues: parsed.error.issues },
    };
  }
  const { seed, actions } = parsed.data;
  try {
    // Regla de oro 2: re-simular la partida completa con el mismo engine que el cliente
    const final = replayGame(gameData, seed, actions);
    const game = {
      gameId: seed,
      userId: req.userId,
      phase: final.phase,
      score: finalScore(final, gameConfig),
      points: final.points,
      kos: final.kos,
      runs: final.runs,
      fights: final.fights,
      rerolls: final.rerolls,
      outcomes: final.outcomes,
      updatedAt: new Date().toISOString(),
    };
    await store.saveGame(game);
    return { statusCode: 201, body: { valid: true, ...game } };
  } catch (e) {
    if (e instanceof CombatError)
      return { statusCode: 422, body: { valid: false, error: e.message } };
    throw e;
  }
}

export async function handleRequest(req: ApiRequest, store: Store): Promise<ApiResponse> {
  const route = `${req.method.toUpperCase()} ${req.path.replace(/\/+$/, '') || '/'}`;

  switch (route) {
    case 'GET /health':
      return { statusCode: 200, body: { ok: true, monsters: monsters.length } };

    case 'POST /games':
      return submitGame(req, store);

    case 'POST /events': {
      const parsed = EventsSchema.safeParse(parseJson(req.body));
      if (!parsed.success) return { statusCode: 400, body: { error: 'Payload inválido' } };
      const { sessionId, events } = parsed.data;
      await store.saveEvents(events.map((e) => ({ ...e, sessionId, userId: req.userId })));
      return { statusCode: 202, body: { accepted: events.length } };
    }

    case 'GET /stats':
      return { statusCode: 200, body: await store.stats() };

    default:
      return { statusCode: 404, body: { error: `Ruta no encontrada: ${route}` } };
  }
}
