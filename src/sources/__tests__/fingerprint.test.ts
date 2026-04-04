import { describe, it, expect } from 'vitest';
import { computeSnapshotFingerprint, computeManifestHash } from '../fingerprint.js';

describe('computeSnapshotFingerprint', () => {
  it('возвращает tree:<oid> для clean git view', () => {
    const result = computeSnapshotFingerprint({
      viewKind: 'branch',
      dirty: false,
      headTreeOid: 'abc123def456',
    });

    expect(result).toBe('tree:abc123def456');
  });

  it('возвращает dirty:<commit>:<hash> для dirty git view', () => {
    const result = computeSnapshotFingerprint({
      viewKind: 'branch',
      dirty: true,
      headCommitOid: 'commit123',
      snapshotManifestHash: 'manifest456',
    });

    expect(result).toBe('dirty:commit123:manifest456');
  });

  it('возвращает workspace:<hash> для non-git workspace', () => {
    const result = computeSnapshotFingerprint({
      viewKind: 'workspace',
      dirty: false,
      snapshotManifestHash: 'ws789',
    });

    expect(result).toBe('workspace:ws789');
  });

  it('обрабатывает detached как git view', () => {
    const result = computeSnapshotFingerprint({
      viewKind: 'detached',
      dirty: false,
      headTreeOid: 'tree123',
    });

    expect(result).toBe('tree:tree123');
  });

  it('dirty detached с commit и manifest', () => {
    const result = computeSnapshotFingerprint({
      viewKind: 'detached',
      dirty: true,
      headCommitOid: 'c1',
      snapshotManifestHash: 'm1',
    });

    expect(result).toBe('dirty:c1:m1');
  });

  it('workspace без manifest hash использует unknown', () => {
    const result = computeSnapshotFingerprint({
      viewKind: 'workspace',
      dirty: false,
    });

    expect(result).toBe('workspace:unknown');
  });
});

describe('computeManifestHash', () => {
  it('возвращает SHA-256 hex строку', () => {
    const hash = computeManifestHash([
      { path: 'a.ts', contentHash: 'hash1' },
      { path: 'b.ts', contentHash: 'hash2' },
    ]);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('сортирует по path перед хэшированием', () => {
    const hash1 = computeManifestHash([
      { path: 'b.ts', contentHash: 'h2' },
      { path: 'a.ts', contentHash: 'h1' },
    ]);

    const hash2 = computeManifestHash([
      { path: 'a.ts', contentHash: 'h1' },
      { path: 'b.ts', contentHash: 'h2' },
    ]);

    expect(hash1).toBe(hash2);
  });

  it('разный порядок с разным содержимым даёт разный хэш', () => {
    const hash1 = computeManifestHash([
      { path: 'a.ts', contentHash: 'h1' },
    ]);

    const hash2 = computeManifestHash([
      { path: 'a.ts', contentHash: 'h2' },
    ]);

    expect(hash1).not.toBe(hash2);
  });

  it('пустой массив возвращает валидный хэш', () => {
    const hash = computeManifestHash([]);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
