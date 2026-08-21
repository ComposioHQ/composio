import { describe, expect, test } from 'bun:test';
import type { AlgoliaDocsRecord } from '@/lib/search-index';
import {
  embeddingContentHash,
  embeddingText,
  embedTexts,
} from '@/lib/knowledge/embeddings';
import {
  buildSemanticArtifact,
  decodeVectors,
  encodeVectors,
  rankSemanticCandidates,
  semanticRecordFromSearchRecord,
  validateSemanticArtifact,
  type KnowledgeSemanticArtifact,
  type KnowledgeSemanticRecord,
} from '@/lib/knowledge/semantic-artifact';

function searchRecord(overrides: Partial<AlgoliaDocsRecord> = {}): AlgoliaDocsRecord {
  return {
    objectID: '/kb/guide/github__tokens__0__abc',
    title: 'GitHub troubleshooting',
    description: 'Known-good GitHub setup and troubleshooting guidance.',
    breadcrumbs: ['Knowledge Base', 'GitHub'],
    url: '/kb/guide/github#tokens',
    page_id: '/kb/guide/github',
    section: 'Tokens are redacted',
    section_id: 'tokens-are-redacted',
    content: 'Provider tokens are redacted from connected-account responses.',
    keywords: ['github', 'connected accounts'],
    slug: 'kb guide github',
    headings: ['Tokens are redacted'],
    tool_names: ['Get authenticated user'],
    tool_slugs: ['GITHUB_GET_THE_AUTHENTICATED_USER'],
    type: 'kb',
    lang: 'en',
    page_rank: 1_900,
    toolkit_popularity: 0,
    section_rank: 96,
    position: 0,
    depth: 2,
    source_type: 'kb',
    canonical_url: '/kb/guide/github#tokens-are-redacted',
    product_areas: ['connected-accounts'],
    toolkit_slugs: ['github'],
    intents: ['troubleshoot'],
    last_verified_at: '2026-08-12',
    ...overrides,
  };
}

function semanticRecord(
  objectID: string,
  title: string,
  contentHash: string,
): KnowledgeSemanticRecord {
  return {
    objectID,
    sourceType: 'kb',
    sourceLabel: 'Knowledge Base',
    pageID: `/kb/guide/${objectID}`,
    title,
    section: title,
    description: `${title} description`,
    content: `${title} content`,
    canonicalUrl: `/kb/guide/${objectID}#answer`,
    breadcrumbs: ['Knowledge Base'],
    productAreas: [],
    toolkitSlugs: [],
    keywords: [],
    slug: objectID,
    toolNames: [],
    toolSlugs: [],
    pageRank: 1_900,
    sectionRank: 96,
    lastVerifiedAt: '2026-08-12',
    contentHash,
    visibility: 'public',
  };
}

function artifact(): KnowledgeSemanticArtifact {
  return {
    formatVersion: 2,
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 2,
    source: {
      repository: 'ComposioHQ/support-knowledge',
      supportKnowledgeCommit: 'abc1234',
      docsContentHash: 'docs-hash',
    },
    builtAt: '2026-08-17T00:00:00.000Z',
    records: [
      semanticRecord('exact-x', 'Exact X', 'hash-x'),
      semanticRecord('diagonal', 'Diagonal', 'hash-d'),
      semanticRecord('exact-y', 'Exact Y', 'hash-y'),
    ],
    vectorsBase64: encodeVectors([
      [1, 0],
      [Math.SQRT1_2, Math.SQRT1_2],
      [0, 1],
    ]),
  };
}

describe('KB embeddings', () => {
  test('builds stable labeled embedding text from retrieval fields', () => {
    const record = searchRecord();

    expect(embeddingText(record)).toBe(`Title: GitHub troubleshooting
Section: Tokens are redacted
Description: Known-good GitHub setup and troubleshooting guidance.
Aliases and exact terms: github | connected accounts | kb guide github | Get authenticated user | GITHUB_GET_THE_AUTHENTICATED_USER
Toolkits: github
Content: Provider tokens are redacted from connected-account responses.`);
    expect(embeddingContentHash(record)).toBe(
      '09245e80265bd75ee43ed2b5ba1db149ff10077e8c8edc61f3ba2d7c82bc624b',
    );
  });

  test('sends the fixed production model contract and restores response index order', async () => {
    let requestBody: unknown;
    const vectors = await embedTexts(['first', 'second'], {
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          data: [
            { index: 1, embedding: [0, 2] },
            { index: 0, embedding: [3, 4] },
          ],
        });
      },
    });

    expect(requestBody).toEqual({
      model: 'text-embedding-3-small',
      dimensions: 256,
      encoding_format: 'float',
      input: ['first', 'second'],
    });
    expect(vectors[0]?.[0]).toBeCloseTo(0.6);
    expect(vectors[0]?.[1]).toBeCloseTo(0.8);
    expect(vectors[1]).toEqual([0, 1]);
  });

  test('forwards cancellation to the OpenAI embedding request', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;

    await embedTexts(['github oauth'], {
      apiKey: 'test-key',
      signal: controller.signal,
      fetch: async (_input, init) => {
        requestSignal = init?.signal;
        return Response.json({ data: [{ index: 0, embedding: [1, 0] }] });
      },
    });

    expect(requestSignal).toBe(controller.signal);
  });
});

describe('KB semantic artifact', () => {
  test('round-trips row-major float32 vectors', () => {
    const encoded = encodeVectors([[1, 0], [0.25, -0.5]]);
    expect([...decodeVectors(encoded, 2, 2)]).toEqual([1, 0, 0.25, -0.5]);
  });

  test('validates model, source, public records, hashes, and normalized vectors', () => {
    const value = artifact();
    expect(validateSemanticArtifact(value, {
      dimensions: 2,
      supportKnowledgeCommit: 'abc1234',
      docsContentHash: 'docs-hash',
      contentHashes: new Map([
        ['exact-x', 'hash-x'],
        ['diagonal', 'hash-d'],
        ['exact-y', 'hash-y'],
      ]),
    })).toBe(value);

    expect(() => validateSemanticArtifact(
      { ...value, model: 'another-model' },
      { dimensions: 2, supportKnowledgeCommit: 'abc1234', docsContentHash: 'docs-hash' },
    )).toThrow('model mismatch');
    expect(() => validateSemanticArtifact(value, {
      dimensions: 2,
      supportKnowledgeCommit: 'abc1234',
      docsContentHash: 'docs-hash',
      contentHashes: new Map([
        ['exact-x', 'tampered'],
        ['diagonal', 'hash-d'],
        ['exact-y', 'hash-y'],
      ]),
    })).toThrow('content hash mismatch');

    const nonUnit = { ...value, vectorsBase64: encodeVectors([[2, 0], [0, 1], [0, 1]]) };
    expect(() => validateSemanticArtifact(
      nonUnit,
      { dimensions: 2, supportKnowledgeCommit: 'abc1234', docsContentHash: 'docs-hash' },
    )).toThrow('not normalized');
    expect(() => validateSemanticArtifact(value, {
      dimensions: 2,
      supportKnowledgeCommit: 'abc1234',
      docsContentHash: 'tampered-docs-hash',
    })).toThrow('docs content hash mismatch');

    const parsed = JSON.parse(JSON.stringify(value)) as KnowledgeSemanticArtifact;
    parsed.records[0]!.sourceType = 'toolkit' as never;
    expect(() => validateSemanticArtifact(parsed, {
      dimensions: 2,
      supportKnowledgeCommit: 'abc1234',
      docsContentHash: 'docs-hash',
    })).toThrow('source type');
  });

  test('ranks every public record by exact cosine similarity', () => {
    const ranked = rankSemanticCandidates(artifact(), [1, 0], 2);

    expect(ranked.map(candidate => candidate.record.objectID)).toEqual(['exact-x', 'diagonal']);
    expect(ranked[0]?.similarity).toBeCloseTo(1);
    expect(ranked[1]?.similarity).toBeCloseTo(Math.SQRT1_2);
    expect(ranked.map(candidate => candidate.rank)).toEqual([1, 2]);
  });

  test('omits candidates below the caller semantic confidence floor', () => {
    const ranked = rankSemanticCandidates(artifact(), [1, 0], 3, {
      minimumSimilarity: 0.8,
    });

    expect(ranked.map(candidate => candidate.record.objectID)).toEqual(['exact-x']);
    expect(ranked[0]?.rank).toBe(1);
  });

  test('maps public docs and KB records into the artifact contract', () => {
    expect(semanticRecordFromSearchRecord(searchRecord())).toEqual({
      objectID: '/kb/guide/github__tokens__0__abc',
      sourceType: 'kb',
      sourceLabel: 'Knowledge Base',
      pageID: '/kb/guide/github',
      title: 'GitHub troubleshooting',
      section: 'Tokens are redacted',
      description: 'Known-good GitHub setup and troubleshooting guidance.',
      content: 'Provider tokens are redacted from connected-account responses.',
      canonicalUrl: '/kb/guide/github#tokens-are-redacted',
      breadcrumbs: ['Knowledge Base', 'GitHub'],
      productAreas: ['connected-accounts'],
      toolkitSlugs: ['github'],
      keywords: ['github', 'connected accounts'],
      slug: 'kb guide github',
      toolNames: ['Get authenticated user'],
      toolSlugs: ['GITHUB_GET_THE_AUTHENTICATED_USER'],
      pageRank: 1_900,
      sectionRank: 96,
      lastVerifiedAt: '2026-08-12',
      contentHash: '09245e80265bd75ee43ed2b5ba1db149ff10077e8c8edc61f3ba2d7c82bc624b',
      visibility: 'public',
    });
    expect(semanticRecordFromSearchRecord(searchRecord({
      objectID: '/docs/claude',
      source_type: 'docs',
      title: 'Connect Claude',
    }))).toMatchObject({ sourceType: 'docs', sourceLabel: 'Docs' });
    expect(() => semanticRecordFromSearchRecord(searchRecord({ source_type: 'toolkit' }))).toThrow(
      'Only public docs and KB records can be embedded',
    );
    expect(() => semanticRecordFromSearchRecord(searchRecord({ source_type: 'reference' }))).toThrow(
      'Only public docs and KB records can be embedded',
    );
  });

  test('reuses unchanged vectors and embeds only changed records', async () => {
    const unchanged = searchRecord({ objectID: 'a', title: 'A' });
    const changed = searchRecord({ objectID: 'b', title: 'B', content: 'new body' });
    const unchangedMetadata = semanticRecordFromSearchRecord(unchanged);
    const prior: KnowledgeSemanticArtifact = {
      formatVersion: 2,
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 256,
      source: {
        repository: 'ComposioHQ/support-knowledge',
        supportKnowledgeCommit: 'old-commit',
        docsContentHash: 'old-docs-hash',
      },
      builtAt: '2026-08-16T00:00:00.000Z',
      records: [unchangedMetadata],
      vectorsBase64: encodeVectors([[1, ...Array.from({ length: 255 }, () => 0)]]),
    };
    const embeddedTexts: string[] = [];

    const built = await buildSemanticArtifact({
      records: [changed, unchanged],
      supportKnowledgeCommit: 'new-commit',
      docsContentHash: 'new-docs-hash',
      builtAt: '2026-08-17T00:00:00.000Z',
      previousArtifact: prior,
      embed: async texts => {
        embeddedTexts.push(...texts);
        return texts.map(() => [0, 1, ...Array.from({ length: 254 }, () => 0)]);
      },
    });

    expect(embeddedTexts).toEqual([embeddingText(changed)]);
    expect(built.records.map(record => record.objectID)).toEqual(['a', 'b']);
    const vectors = decodeVectors(built.vectorsBase64, 2, 256);
    expect([vectors[0], vectors[1], vectors[256], vectors[257]]).toEqual([1, 0, 0, 1]);
    expect(built.source.supportKnowledgeCommit).toBe('new-commit');
  });
});
