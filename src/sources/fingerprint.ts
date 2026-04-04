// Генерация snapshot_fingerprint для source_views.
import { createHash } from 'node:crypto';

// Параметры для вычисления fingerprint.
export interface FingerprintParams {
  viewKind: 'branch' | 'detached' | 'workspace';
  dirty: boolean;
  headCommitOid?: string;
  headTreeOid?: string;
  // SHA-256 хэш полного snapshot manifest.
  snapshotManifestHash?: string;
}

/**
 * Вычисляет snapshot fingerprint.
 *
 * Форматы:
 * - `tree:<head_tree_oid>` — clean git snapshot.
 * - `dirty:<head_commit_oid>:<sha256(manifest)>` — dirty git snapshot.
 * - `workspace:<sha256(manifest)>` — non-git workspace.
 */
export function computeSnapshotFingerprint(params: FingerprintParams): string {
  const { viewKind, dirty, headCommitOid, headTreeOid, snapshotManifestHash } = params;

  if (viewKind === 'workspace') {
    // Non-git workspace — используем manifest hash.
    const hash = snapshotManifestHash ?? 'unknown';
    console.log(`[fingerprint] workspace: hash=${hash.slice(0, 12)}...`);
    return `workspace:${hash}`;
  }

  if (!dirty && headTreeOid) {
    // Clean git snapshot — tree OID достаточен.
    console.log(`[fingerprint] tree: oid=${headTreeOid.slice(0, 12)}...`);
    return `tree:${headTreeOid}`;
  }

  // Dirty git snapshot — commit OID + manifest hash.
  const commitOid = headCommitOid ?? 'unknown';
  const hash = snapshotManifestHash ?? 'unknown';
  console.log(`[fingerprint] dirty: commit=${commitOid.slice(0, 12)}..., manifest=${hash.slice(0, 12)}...`);
  return `dirty:${commitOid}:${hash}`;
}

/**
 * Вычисляет SHA-256 хэш snapshot manifest из отсортированного списка (path, contentHash).
 */
export function computeManifestHash(
  entries: Array<{ path: string; contentHash: string }>,
): string {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const manifest = sorted.map((e) => `${e.path}\t${e.contentHash}`).join('\n');
  return createHash('sha256').update(manifest).digest('hex');
}
