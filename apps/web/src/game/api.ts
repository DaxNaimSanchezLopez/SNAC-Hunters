// Cliente HTTP de la API (API Gateway + Lambda en AWS, o el servidor local en desarrollo).
import type { GameAction } from '@snac-hunters/engine';
import { API_URL } from './config';
import { getIdToken } from './auth';

export interface ServerGameResult {
  readonly valid: boolean;
  readonly score?: number;
  readonly error?: string;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...init.headers,
    },
  });
}

/** El cliente solo manda seed + acciones de la partida; el servidor re-simula y decide. */
export async function submitGame(
  seed: string,
  actions: readonly GameAction[],
): Promise<ServerGameResult> {
  const res = await request('/games', {
    method: 'POST',
    body: JSON.stringify({ seed, actions }),
  });
  return (await res.json()) as ServerGameResult;
}

export async function sendEvents(sessionId: string, events: readonly unknown[]): Promise<boolean> {
  try {
    const res = await request('/events', {
      method: 'POST',
      body: JSON.stringify({ sessionId, events }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchServerStats(): Promise<unknown> {
  const res = await request('/stats');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
