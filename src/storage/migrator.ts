// Движок миграций для PostgreSQL.
import type postgres from 'postgres';

// Интерфейс миграции.
export interface Migration {
  name: string;
  up(sql: postgres.Sql): Promise<void>;
}

// Создает таблицу _migrations, если она не существует.
async function ensureMigrationsTable(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

// Возвращает список имен примененных миграций.
export async function getAppliedMigrations(sql: postgres.Sql): Promise<string[]> {
  await ensureMigrationsTable(sql);

  const rows = await sql<{ name: string }[]>`
    SELECT name FROM _migrations ORDER BY applied_at
  `;

  return rows.map((row) => row.name);
}

// Применяет непримененные миграции последовательно.
// Каждая миграция выполняется отдельно; запись в _migrations происходит после успешного up.
// DDL в PostgreSQL транзакционный, поэтому отдельная обертка в begin не требуется.
export async function runMigrations(
  sql: postgres.Sql,
  migrations: Migration[],
): Promise<void> {
  await ensureMigrationsTable(sql);

  const applied = new Set(await getAppliedMigrations(sql));

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue;
    }

    await migration.up(sql);
    await sql`
      INSERT INTO _migrations (name) VALUES (${migration.name})
    `;
  }
}
