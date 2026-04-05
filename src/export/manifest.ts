// Чтение/запись manifest.json для экспорта/импорта (v1 + v2).
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type postgres from 'postgres';
import { getAppliedMigrations } from '../storage/index.js';

// --- V1 manifest (legacy, для reject при импорте). ---

const ManifestV1SourceSchema = z.object({
  name: z.string(),
  type: z.enum(['local', 'git']),
  path: z.string().nullable(),
  chunksCount: z.number(),
  hasEmbeddings: z.boolean(),
});

const ManifestV1Schema = z.object({
  version: z.literal(1),
  schemaVersion: z.number(),
  createdAt: z.string(),
  localRagVersion: z.string(),
  sources: z.array(ManifestV1SourceSchema),
  includesEmbeddings: z.boolean(),
  includesConfig: z.boolean(),
});

export type ManifestV1 = z.infer<typeof ManifestV1Schema>;

// --- V2 manifest (branch-aware schema). ---

const ManifestV2SourceSchema = z.object({
  name: z.string(),
  type: z.enum(['local', 'git']),
  path: z.string().nullable(),
  viewCount: z.number(),
  chunkCount: z.number(),
  fileBlobCount: z.number(),
  chunkContentCount: z.number(),
  hasEmbeddings: z.boolean(),
});

const ManifestV2Schema = z.object({
  version: z.literal(2),
  schemaVersion: z.number(),
  createdAt: z.string(),
  localRagVersion: z.string(),
  sources: z.array(ManifestV2SourceSchema),
  includesEmbeddings: z.boolean(),
  includesConfig: z.boolean(),
});

export type ManifestV2Source = z.infer<typeof ManifestV2SourceSchema>;
export type ManifestV2 = z.infer<typeof ManifestV2Schema>;

// Текущий тип манифеста.
export type Manifest = ManifestV2;
export type ManifestSource = ManifestV2Source;

// Имя файла манифеста.
const MANIFEST_FILE = 'manifest.json';

// Записывает v2 манифест в директорию.
export async function writeManifest(dir: string, manifest: Manifest): Promise<void> {
  const filePath = join(dir, MANIFEST_FILE);
  const data = JSON.stringify(manifest, null, 2);
  await writeFile(filePath, data, 'utf-8');
}

// Читает манифест и определяет версию.
export async function readManifest(dir: string): Promise<Manifest> {
  const filePath = join(dir, MANIFEST_FILE);
  const raw = await readFile(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in manifest: ${filePath}`);
  }

  // Определяем версию.
  const versionCheck = z.object({ version: z.number() }).safeParse(parsed);
  if (!versionCheck.success) {
    throw new Error('Missing or invalid "version" field in manifest');
  }

  if (versionCheck.data.version === 1) {
    // Валидируем как v1, но бросаем ошибку.
    ManifestV1Schema.parse(parsed);
    throw new Error(
      'Manifest version 1 is incompatible with the current branch-aware schema (v2). ' +
      'Re-index your sources with the current version of local-rag instead of importing v1 archives.',
    );
  }

  return ManifestV2Schema.parse(parsed);
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
