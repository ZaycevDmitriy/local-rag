// Чтение/запись manifest.json для экспорта/импорта.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { getAppliedMigrations } from '../storage/migrator.js';
import type postgres from 'postgres';

// Zod-схема источника в манифесте.
const ManifestSourceSchema = z.object({
  name: z.string(),
  type: z.enum(['local', 'git']),
  path: z.string().nullable(),
  chunksCount: z.number(),
  hasEmbeddings: z.boolean(),
});

// Zod-схема манифеста.
const ManifestSchema = z.object({
  version: z.literal(1),
  schemaVersion: z.number(),
  createdAt: z.string(),
  localRagVersion: z.string(),
  sources: z.array(ManifestSourceSchema),
  includesEmbeddings: z.boolean(),
  includesConfig: z.boolean(),
});

export type ManifestSource = z.infer<typeof ManifestSourceSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

// Имя файла манифеста.
const MANIFEST_FILE = 'manifest.json';

// Записывает манифест в директорию.
export async function writeManifest(dir: string, manifest: Manifest): Promise<void> {
  const filePath = join(dir, MANIFEST_FILE);
  const data = JSON.stringify(manifest, null, 2);
  await writeFile(filePath, data, 'utf-8');
}

// Читает и валидирует манифест из директории.
export async function readManifest(dir: string): Promise<Manifest> {
  const filePath = join(dir, MANIFEST_FILE);
  const raw = await readFile(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in manifest: ${filePath}`);
  }

  return ManifestSchema.parse(parsed);
}

// Возвращает версию схемы БД (количество применённых миграций).
export async function getSchemaVersion(sql: postgres.Sql): Promise<number> {
  const migrations = await getAppliedMigrations(sql);
  return migrations.length;
}

// Читает версию local-rag из package.json.
export async function getLocalRagVersion(): Promise<string> {
  const pkgPath = new URL('../../package.json', import.meta.url);
  const raw = await readFile(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}
