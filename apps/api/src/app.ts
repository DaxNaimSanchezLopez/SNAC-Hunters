// Router HTTP independiente de AWS: lo usan la Lambda, el servidor local y los tests.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CombatError, replayCombat } from '@snac-hunters/engine';
import { diceTable, gameConfig, monsters, serverSetup } from './game.js';
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

const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reroll'), dieIds: z.array(z.string().max(8)).min(1).max(40) }),
  z.object({ type: z.literal('assign'), dieId: z.string().max(8), slot: z.number().int() }),
  z.object({ type: z.literal('unassign'), slot: z.number().int() }),
  z.object({ type: z.literal('resolve'), trophy: SymbolSchema.optional() }),
]);

// El cliente solo envía seed + acciones; el resultado lo calcula el servidor.
const RunSubmissionSchema = z.object({
  monsterId: z.string().min(1).max(64),
  seed: z.string().min(1).max(128),
  actions: z.array(ActionSchema).max(300),
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

async function submitRun(req: ApiRequest, store: Store): Promise<ApiResponse> {
  const parsed = RunSubmissionSchema.safeParse(parseJson(req.body));
  if (!parsed.success) {
    return {
      statusCode: 400,
      body: { valid: false, error: 'Payload inválido', issues: parsed.error.issues },
    };
  }
  const { monsterId, seed, actions } = parsed.data;
  const monster = monsters.find((m) => m.id === monsterId);
  if (!monster)
    return { statusCode: 404, body: { valid: false, error: `Monstruo "${monsterId}" no existe` } };

  try {
    // Regla de oro 2: re-simular seed + acciones con el mismo engine que el cliente
    const final = replayCombat(monster, serverSetup, seed, actions, diceTable);
    if (final.status !== 'resolved' || final.outcome === null) {
      return { statusCode: 422, body: { valid: false, error: 'El combate no ha terminado' } };
    }
    const koPenalty = final.ko && final.outcome !== 'ko' ? gameConfig.scoring.ko : 0;
    const run = {
      runId: randomUUID(),
      userId: req.userId,
      monsterId,
      seed,
      outcome: final.outcome,
      ko: final.ko,
      trophy: final.trophy,
      points: gameConfig.scoring[final.outcome] + koPenalty,
      rerolls: final.rerolls,
      createdAt: new Date().toISOString(),
    };
    await store.saveRun(run);
    return { statusCode: 201, body: { valid: true, ...run, hp: final.hp } };
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

    case 'POST /runs':
      return submitRun(req, store);

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
