// Barrel-файл модуля источников.
export type { ScannedFile, ScanResult } from './local.js';
export { scanLocalFiles } from './local.js';
export type { GitCloneResult, RepoContext, CurrentRef } from './git.js';
export {
  cloneOrPull,
  expandHome,
  extractRepoName,
  resolveRepoContext,
  getCurrentRef,
  listLocalBranches,
  getHeadCommit,
  getHeadTree,
  getSubtreeOid,
  isDirtyWorktree,
  getCommittedDiffPaths,
  getTrackedWorktreeChanges,
  getUntrackedFiles,
  isAncestor,
} from './git.js';
export { FileFilter } from './file-filter.js';
export type { FingerprintParams } from './fingerprint.js';
export { computeSnapshotFingerprint, computeManifestHash } from './fingerprint.js';
