// Adaptador DynamoDB (single-table): pk GAME#<user> / EVENT#<session>.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { summarize } from './store.js';
import type { EventRecord, GameRecord, Stats, Store } from './store.js';

export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client);
  }

  /** Put con la misma clave reemplaza la partida: cada envío trae la partida completa. */
  async saveGame(game: GameRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: `GAME#${game.userId}`, sk: game.gameId, kind: 'game', ...game },
      }),
    );
  }

  async saveEvents(events: readonly EventRecord[]): Promise<void> {
    // BatchWrite acepta máximo 25 elementos por llamada
    for (let i = 0; i < events.length; i += 25) {
      const chunk = events.slice(i, i + 25);
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((e, j) => ({
              PutRequest: {
                Item: { pk: `EVENT#${e.sessionId}`, sk: `${e.at}#${i + j}`, kind: 'event', ...e },
              },
            })),
          },
        }),
      );
    }
  }

  // Scan basta para el volumen de la demo; en producción: Firehose -> S3 -> Athena
  async stats(): Promise<Stats> {
    const games: GameRecord[] = [];
    const events: EventRecord[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new ScanCommand({ TableName: this.tableName, ExclusiveStartKey: cursor }),
      );
      for (const item of page.Items ?? []) {
        if (item.kind === 'game') games.push(item as GameRecord);
        else if (item.kind === 'event') events.push(item as EventRecord);
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return summarize(games, events);
  }
}
