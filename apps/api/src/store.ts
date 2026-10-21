// Puerto de persistencia: la lógica HTTP no sabe si guarda en DynamoDB o en memoria.
import type { GameSymbol, Outcome } from '@snac-hunters/engine';

export interface RunRecord {
  readonly runId: string;
  readonly userId: string;
  readonly monsterId: string;
  readonly seed: string;
  readonly outcome: Outcome;
  readonly ko: boolean;
  readonly trophy: GameSymbol | null;
  readonly points: number;
  readonly rerolls: number;
  readonly createdAt: string;
}

export interface EventRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly type: string;
  readonly at: number;
  readonly data: Record<string, unknown>;
}

export interface Stats {
  readonly runs: number;
  readonly points: number;
  readonly outcomes: Record<string, number>;
  readonly sessions: number;
  readonly events: Record<string, number>;
  readonly avgRerolls: number;
}

export interface Store {
  saveRun(run: RunRecord): Promise<void>;
  saveEvents(events: readonly EventRecord[]): Promise<void>;
  stats(): Promise<Stats>;
}

export function summarize(runs: readonly RunRecord[], events: readonly EventRecord[]): Stats {
  const outcomes: Record<string, number> = {};
  for (const r of runs) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;
  return {
    runs: runs.length,
    points: runs.reduce((acc, r) => acc + r.points, 0),
    outcomes,
    sessions: new Set(events.map((e) => e.sessionId)).size,
    events: byType,
    avgRerolls: runs.length ? runs.reduce((a, r) => a + r.rerolls, 0) / runs.length : 0,
  };
}

/** Implementación en memoria para desarrollo local y tests de integración. */
export class MemoryStore implements Store {
  readonly runs: RunRecord[] = [];
  readonly events: EventRecord[] = [];

  async saveRun(run: RunRecord): Promise<void> {
    this.runs.push(run);
  }

  async saveEvents(events: readonly EventRecord[]): Promise<void> {
    this.events.push(...events);
  }

  async stats(): Promise<Stats> {
    return summarize(this.runs, this.events);
  }
}
