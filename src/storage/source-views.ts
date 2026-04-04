// CRUD-операции для таблицы source_views (branch-aware snapshot).
import type postgres from 'postgres';
import type { SourceViewRow } from './schema.js';

// Вход для upsert view.
export interface SourceViewUpsert {
  sourceId: string;
  viewKind: 'branch' | 'detached' | 'workspace';
  refName?: string;
  headCommitOid?: string;
  headTreeOid?: string;
  subtreeOid?: string;
  dirty?: boolean;
  snapshotFingerprint: string;
}

// Вход для обновления view после индексации.
export interface ViewAfterIndexUpdate {
  viewId: string;
  headCommitOid?: string;
  headTreeOid?: string;
  subtreeOid?: string;
  dirty: boolean;
  snapshotFingerprint: string;
  fileCount: number;
  chunkCount: number;
}

// Хранилище snapshot-views.
export class SourceViewStorage {
  constructor(private sql: postgres.Sql) {}

  // Возвращает workspace view для источника.
  async getWorkspaceView(sourceId: string): Promise<SourceViewRow | null> {
    const rows = await this.sql<SourceViewRow[]>`
      SELECT * FROM source_views
      WHERE source_id = ${sourceId} AND view_kind = 'workspace'
    `;

    return rows[0] ?? null;
  }

  // Возвращает branch/detached view по ref_name.
  async getRefView(
    sourceId: string,
    viewKind: 'branch' | 'detached',
    refName: string,
  ): Promise<SourceViewRow | null> {
    const rows = await this.sql<SourceViewRow[]>`
      SELECT * FROM source_views
      WHERE source_id = ${sourceId}
        AND view_kind = ${viewKind}
        AND ref_name = ${refName}
    `;

    return rows[0] ?? null;
  }

  // Создаёт или обновляет view (upsert).
  async upsertView(input: SourceViewUpsert): Promise<SourceViewRow> {
    console.log(
      `[SourceViewStorage] upsertView: sourceId=${input.sourceId}, kind=${input.viewKind}, ref=${input.refName ?? 'null'}`,
    );

    const rows = await this.sql<SourceViewRow[]>`
      INSERT INTO source_views (
        source_id, view_kind, ref_name,
        head_commit_oid, head_tree_oid, subtree_oid,
        dirty, snapshot_fingerprint, last_seen_at
      )
      VALUES (
        ${input.sourceId},
        ${input.viewKind},
        ${input.refName ?? null},
        ${input.headCommitOid ?? null},
        ${input.headTreeOid ?? null},
        ${input.subtreeOid ?? null},
        ${input.dirty ?? false},
        ${input.snapshotFingerprint},
        now()
      )
      ON CONFLICT (source_id, view_kind, ref_name) DO UPDATE SET
        head_commit_oid = EXCLUDED.head_commit_oid,
        head_tree_oid = EXCLUDED.head_tree_oid,
        subtree_oid = EXCLUDED.subtree_oid,
        dirty = EXCLUDED.dirty,
        snapshot_fingerprint = EXCLUDED.snapshot_fingerprint,
        last_seen_at = now(),
        updated_at = now()
      RETURNING *
    `;

    return rows[0]!;
  }

  // Возвращает view по id.
  async getById(viewId: string): Promise<SourceViewRow | null> {
    const rows = await this.sql<SourceViewRow[]>`
      SELECT * FROM source_views WHERE id = ${viewId}
    `;

    return rows[0] ?? null;
  }

  // Все views для источника.
  async listBySource(sourceId: string): Promise<SourceViewRow[]> {
    return await this.sql<SourceViewRow[]>`
      SELECT * FROM source_views
      WHERE source_id = ${sourceId}
      ORDER BY view_kind, ref_name
    `;
  }

  // Удаляет branch views, которых больше нет локально. Возвращает ID удалённых views.
  async deleteMissingBranchViews(
    sourceId: string,
    existingBranches: string[],
  ): Promise<string[]> {
    if (existingBranches.length === 0) {
      // Удалить все branch views.
      const deleted = await this.sql<Array<{ id: string }>>`
        DELETE FROM source_views
        WHERE source_id = ${sourceId} AND view_kind = 'branch'
        RETURNING id
      `;

      console.log(
        `[SourceViewStorage] deleteMissingBranchViews: sourceId=${sourceId}, deleted=${deleted.length} (all)`,
      );

      return deleted.map((r) => r.id);
    }

    const deleted = await this.sql<Array<{ id: string }>>`
      DELETE FROM source_views
      WHERE source_id = ${sourceId}
        AND view_kind = 'branch'
        AND ref_name IS NOT NULL
        AND ref_name != ALL(${existingBranches})
      RETURNING id
    `;

    console.log(
      `[SourceViewStorage] deleteMissingBranchViews: sourceId=${sourceId}, deleted=${deleted.length}`,
    );

    return deleted.map((r) => r.id);
  }

  // Обновляет view после успешной индексации.
  async updateAfterIndex(input: ViewAfterIndexUpdate): Promise<void> {
    console.log(
      `[SourceViewStorage] updateAfterIndex: viewId=${input.viewId}, files=${input.fileCount}, chunks=${input.chunkCount}`,
    );

    await this.sql`
      UPDATE source_views SET
        head_commit_oid = ${input.headCommitOid ?? null},
        head_tree_oid = ${input.headTreeOid ?? null},
        subtree_oid = ${input.subtreeOid ?? null},
        dirty = ${input.dirty},
        snapshot_fingerprint = ${input.snapshotFingerprint},
        file_count = ${input.fileCount},
        chunk_count = ${input.chunkCount},
        last_indexed_at = now(),
        updated_at = now()
      WHERE id = ${input.viewId}
    `;
  }

  // Возвращает default views (active_view_id) для всех источников.
  async resolveDefaultViews(): Promise<SourceViewRow[]> {
    return await this.sql<SourceViewRow[]>`
      SELECT sv.* FROM source_views sv
      INNER JOIN sources s ON s.active_view_id = sv.id
      ORDER BY s.name
    `;
  }
}
