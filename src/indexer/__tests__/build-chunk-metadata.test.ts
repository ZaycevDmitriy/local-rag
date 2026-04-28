import { describe, it, expect } from 'vitest';
import { buildChunkMetadataJson } from '../_helpers/metadata.js';
import type { ChunkMetadata } from '../../chunks/index.js';

describe('buildChunkMetadataJson', () => {
  it('оставляет только extra metadata и пропускает undefined-поля', () => {
    const metadata: ChunkMetadata = {
      path: 'src/Foo.kt',
      sourceType: 'code',
      startLine: 10,
      endLine: 40,
      headerPath: 'Foo.bar',
      language: 'kotlin',
      fqn: 'com.example.Foo.bar',
      fragmentType: 'method',
      fragmentSubtype: 'DATA_CLASS',
      receiverType: 'String',
      headerLevel: undefined,
      startOffset: 100,
      endOffset: 260,
      pageStart: undefined,
      pageEnd: undefined,
    };

    expect(buildChunkMetadataJson(metadata)).toEqual({
      fqn: 'com.example.Foo.bar',
      fragmentType: 'method',
      fragmentSubtype: 'DATA_CLASS',
      receiverType: 'String',
      startOffset: 100,
      endOffset: 260,
    });
  });
});
