import type { ChunkMetadata } from '../../chunks/index.js';

const EXTRA_METADATA_KEYS = [
  'fqn',
  'fragmentType',
  'fragmentSubtype',
  'receiverType',
  'headerLevel',
  'startOffset',
  'endOffset',
  'pageStart',
  'pageEnd',
] as const satisfies ReadonlyArray<keyof ChunkMetadata>;

export function buildChunkMetadataJson(metadata: ChunkMetadata): Record<string, unknown> {
  const json: Record<string, unknown> = {};

  for (const key of EXTRA_METADATA_KEYS) {
    const value = metadata[key];
    if (value !== undefined) {
      json[key] = value;
    }
  }

  return json;
}
