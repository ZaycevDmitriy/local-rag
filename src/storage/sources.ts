// CRUD-операции для таблицы sources.
import type postgres from 'postgres';
import type { SourceRow } from './schema.js';

// Приводим Record<string, unknown> к типу, совместимому с postgres.JSONValue.
type JsonSafe = postgres.JSONValue;

// Хранилище источников данных.
export class SourceStorage {
  constructor(private sql: postgres.Sql) {}

  // Создает или обновляет источник по имени (upsert).
  async upsert(data: {
    name: string;
    type: 'local' | 'git';
    path?: string;
    gitUrl?: string;
    gitBranch?: string;
    config?: Record<string, unknown>;
  }): Promise<SourceRow> {
    const config = data.config ?? {};

    const rows = await this.sql<SourceRow[]>`
      INSERT INTO sources (name, type, path, git_url, git_branch, config)
      VALUES (
        ${data.name},
        ${data.type},
        ${data.path ?? null},
        ${data.gitUrl ?? null},
        ${data.gitBranch ?? null},
        ${this.sql.json(config as JsonSafe)}
      )
      ON CONFLICT (name) DO UPDATE SET
        type = EXCLUDED.type,
        path = EXCLUDED.path,
        git_url = EXCLUDED.git_url,
        git_branch = EXCLUDED.git_branch,
        config = EXCLUDED.config,
        updated_at = now()
      RETURNING *
    `;

    return rows[0]!;
  }

  // Возвращает источник по имени или null.
  async getByName(name: string): Promise<SourceRow | null> {
    const rows = await this.sql<SourceRow[]>`
      SELECT * FROM sources WHERE name = ${name}
    `;

    return rows[0] ?? null;
  }

  // Возвращает все источники, отсортированные по имени.
  async getAll(): Promise<SourceRow[]> {
    return await this.sql<SourceRow[]>`
      SELECT * FROM sources ORDER BY name
    `;
  }

  // Удаляет источник по имени. Чанки удаляются каскадно.
  async remove(name: string): Promise<void> {
    await this.sql`
      DELETE FROM sources WHERE name = ${name}
    `;
  }

  // Обновляет метаданные после индексации.
  async updateAfterIndex(sourceId: string, chunkCount: number): Promise<void> {
    await this.sql`
      UPDATE sources
      SET last_indexed_at = now(),
          chunk_count = ${chunkCount},
          updated_at = now()
      WHERE id = ${sourceId}
    `;
  }
}
