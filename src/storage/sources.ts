// CRUD-операции для таблицы sources (branch-aware schema).
import type postgres from 'postgres';
import type { SourceRow } from './schema.js';

// Приводим Record<string, unknown> к типу, совместимому с postgres.JSONValue.
type JsonSafe = postgres.JSONValue;

// Хранилище логических источников данных.
export class SourceStorage {
  constructor(private sql: postgres.Sql) {}

  // Создаёт или обновляет логический источник по имени.
  async upsertDefinition(data: {
    name: string;
    type: 'local' | 'git';
    path?: string;
    gitUrl?: string;
    repoRootPath?: string;
    repoSubpath?: string;
    config?: Record<string, unknown>;
  }): Promise<SourceRow> {
    console.log(`[SourceStorage] upsertDefinition: name=${data.name}, type=${data.type}`);

    const config = data.config ?? {};

    const rows = await this.sql<SourceRow[]>`
      INSERT INTO sources (name, type, path, git_url, repo_root_path, repo_subpath, config)
      VALUES (
        ${data.name},
        ${data.type},
        ${data.path ?? null},
        ${data.gitUrl ?? null},
        ${data.repoRootPath ?? null},
        ${data.repoSubpath ?? null},
        ${this.sql.json(config as JsonSafe)}
      )
      ON CONFLICT (name) DO UPDATE SET
        type = EXCLUDED.type,
        path = EXCLUDED.path,
        git_url = EXCLUDED.git_url,
        repo_root_path = EXCLUDED.repo_root_path,
        repo_subpath = EXCLUDED.repo_subpath,
        config = EXCLUDED.config,
        updated_at = now()
      RETURNING *
    `;

    return rows[0]!;
  }

  // Возвращает источник по ID.
  async getById(id: string): Promise<SourceRow | null> {
    const rows = await this.sql<SourceRow[]>`
      SELECT * FROM sources WHERE id = ${id}
    `;

    return rows[0] ?? null;
  }

  // Возвращает источник по имени.
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

  // Удаляет источник по ID. Каскадно удаляются views, indexed_files, chunks.
  async remove(sourceId: string): Promise<void> {
    console.log(`[SourceStorage] remove: sourceId=${sourceId}`);

    await this.sql`
      DELETE FROM sources WHERE id = ${sourceId}
    `;
  }

  // Устанавливает active_view_id для источника.
  async setActiveView(sourceId: string, viewId: string | null): Promise<void> {
    console.log(`[SourceStorage] setActiveView: sourceId=${sourceId}, viewId=${viewId}`);

    await this.sql`
      UPDATE sources
      SET active_view_id = ${viewId},
          updated_at = now()
      WHERE id = ${sourceId}
    `;
  }

  // Обновляет last_indexed_at для источника.
  async updateLastIndexedAt(sourceId: string): Promise<void> {
    await this.sql`
      UPDATE sources
      SET last_indexed_at = now(),
          updated_at = now()
      WHERE id = ${sourceId}
    `;
  }

  // @deprecated — backward-compatible метод. Удалить после переработки indexer (Task 5).
  async upsert(data: {
    name: string;
    type: 'local' | 'git';
    path?: string;
    gitUrl?: string;
    gitBranch?: string;
    config?: Record<string, unknown>;
  }): Promise<SourceRow> {
    return this.upsertDefinition({
      name: data.name,
      type: data.type,
      path: data.path,
      gitUrl: data.gitUrl,
      config: data.config,
    });
  }

  // @deprecated — backward-compatible метод. Удалить после переработки indexer (Task 5).
  async updateAfterIndex(sourceId: string, _chunkCount: number): Promise<void> {
    await this.updateLastIndexedAt(sourceId);
  }
}
