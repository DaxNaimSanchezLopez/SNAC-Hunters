// Registro de analítica: sesiones, apariciones de monstruos, tiradas y resultados.
// Se guarda en IndexedDB y se envía en lotes a POST /events (Lambda -> DynamoDB).
import type { Face } from '@snac-hunters/engine';
import { sendEvents } from './api';
import { isEnabled } from './config';
import { idbStorage } from './persistence';

export interface AnalyticsEvent {
  readonly type: string;
  readonly at: number;
  readonly sessionId: string;
  readonly data: Record<string, unknown>;
}

const KEY = 'snac-analytics:v1';
const MAX_EVENTS = 2000;

export const sessionId: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let cache: AnalyticsEvent[] | null = null;
let pending: AnalyticsEvent[] = [];

async function load(): Promise<AnalyticsEvent[]> {
  if (cache) return cache;
  try {
    const raw = await idbStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? (parsed as AnalyticsEvent[]) : [];
  } catch {
    cache = []; // datos corruptos: se descartan en lugar de romper el juego
  }
  return cache;
}

export async function track(type: string, data: Record<string, unknown> = {}): Promise<void> {
  const event: AnalyticsEvent = { type, at: Date.now(), sessionId, data };
  const events = await load();
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  pending.push(event);
  await idbStorage.setItem(KEY, JSON.stringify(events));
}

/** Envía los eventos pendientes al servidor; si falla se reintentan en el próximo flush. */
export async function flush(): Promise<void> {
  if (!isEnabled('serverValidation') || pending.length === 0) return;
  const batch = pending.slice(0, 100);
  const ok = await sendEvents(
    sessionId,
    batch.map(({ type, at, data }) => ({ type, at, data })),
  );
  if (ok) pending = pending.slice(batch.length);
}

export async function allEvents(): Promise<readonly AnalyticsEvent[]> {
  return [...(await load())];
}

export interface LocalSummary {
  readonly sessions: number;
  readonly combats: number;
  readonly outcomes: Record<string, number>;
  readonly avgRerolls: number;
  readonly monstersSeen: Record<string, number>;
  readonly faceShare: Partial<Record<Face, number>>;
  readonly tutorialCompletions: number;
  readonly avgTutorialSeconds: number | null;
}

/** Resumen para el botón de desarrollo (no es lógica de juego: solo agrega eventos). */
export function summarize(events: readonly AnalyticsEvent[]): LocalSummary {
  const outcomes: Record<string, number> = {};
  const monstersSeen: Record<string, number> = {};
  const faces: Record<string, number> = {};
  let rerolls = 0;
  let combats = 0;
  let totalFaces = 0;
  let tutorialStart: number | null = null;
  const tutorialDurations: number[] = [];

  for (const e of events) {
    if (e.type === 'monster_seen') {
      const id = String(e.data.monsterId);
      monstersSeen[id] = (monstersSeen[id] ?? 0) + 1;
    } else if (e.type === 'dice_rolled') {
      for (const f of (e.data.faces as string[] | undefined) ?? []) {
        faces[f] = (faces[f] ?? 0) + 1;
        totalFaces++;
      }
    } else if (e.type === 'combat_resolved') {
      combats++;
      const o = String(e.data.outcome);
      outcomes[o] = (outcomes[o] ?? 0) + 1;
      rerolls += Number(e.data.rerolls ?? 0);
    } else if (e.type === 'tutorial_start') {
      tutorialStart = e.at;
    } else if (e.type === 'tutorial_complete') {
      // El tutorial puede terminar en otra sesión si el jugador recargó a mitad
      if (tutorialStart !== null) tutorialDurations.push((e.at - tutorialStart) / 1000);
      tutorialStart = null;
    }
  }

  const faceShare: Partial<Record<Face, number>> = {};
  for (const [f, n] of Object.entries(faces))
    faceShare[f as Face] = totalFaces ? n / totalFaces : 0;

  return {
    sessions: new Set(events.map((e) => e.sessionId)).size,
    combats,
    outcomes,
    avgRerolls: combats ? rerolls / combats : 0,
    monstersSeen,
    faceShare,
    tutorialCompletions: tutorialDurations.length,
    avgTutorialSeconds: tutorialDurations.length
      ? tutorialDurations.reduce((a, b) => a + b, 0) / tutorialDurations.length
      : null,
  };
}
