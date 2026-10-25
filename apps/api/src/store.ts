// Puerto de persistencia: la lógica HTTP no sabe si guarda en DynamoDB o en memoria.
import type { GamePhase, GameResult, Outcome } from '@snac-hunters/engine';

/** Resumen de una partida re-simulada por el servidor (se actualiza en cada envío). */
export interface GameRecord {
  readonly gameId: string;
  readonly userId: string;
  readonly phase: GamePhase;
  /** V1: victoria, sin vidas, cayó Pieland o abandonada; null si sigue en curso. */
  readonly result: GameResult | null;
  readonly score: number;
  readonly points: number;
  readonly kos: number;
  readonly runs: number;
  readonly fights: number;
  readonly rerolls: number;
  readonly outcomes: Partial<Record<Outcome, number>>;
  readonly updatedAt: string;
}

export interface EventRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly type: string;
  readonly at: number;
  readonly data: Record<string, unknown>;
}

export interface Stats {
  readonly games: number;
  readonly finished: number;
  readonly victories: number;
  readonly avgScore: number;
  readonly fights: number;
  readonly outcomes: Record<string, number>;
  readonly sessions: number;
  readonly events: Record<string, number>;
  readonly avgRerolls: number;
}

export interface Store {
  saveGame(game: GameRecord): Promise<void>;
  saveEvents(events: readonly EventRecord[]): Promise<void>;
  stats(): Promise<Stats>;
}

export function summarize(games: readonly GameRecord[], events: readonly EventRecord[]): Stats {
  const outcomes: Record<string, number> = {};
  for (const g of games) {
    for (const [o, n] of Object.entries(g.outcomes)) outcomes[o] = (outcomes[o] ?? 0) + (n ?? 0);
  }
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;
  const fights = games.reduce((a, g) => a + g.fights, 0);
  return {
    games: games.length,
    finished: games.filter((g) => g.phase === 'over').length,
    victories: games.filter((g) => g.result === 'victory').length,
    avgScore: games.length ? games.reduce((a, g) => a + g.score, 0) / games.length : 0,
    fights,
    outcomes,
    sessions: new Set(events.map((e) => e.sessionId)).size,
    events: byType,
    avgRerolls: fights ? games.reduce((a, g) => a + g.rerolls, 0) / fights : 0,
  };
}

/** Implementación en memoria para desarrollo local y tests de integración. */
export class MemoryStore implements Store {
  readonly games = new Map<string, GameRecord>();
  readonly events: EventRecord[] = [];

  async saveGame(game: GameRecord): Promise<void> {
    this.games.set(`${game.userId}#${game.gameId}`, game);
  }

  async saveEvents(events: readonly EventRecord[]): Promise<void> {
    this.events.push(...events);
  }

  async stats(): Promise<Stats> {
    return summarize([...this.games.values()], this.events);
  }
}
