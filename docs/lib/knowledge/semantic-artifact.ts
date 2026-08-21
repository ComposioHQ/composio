import {
  embeddingContentHash,
  embeddingText,
  KB_EMBEDDING_DIMENSIONS,
  KB_EMBEDDING_MODEL,
  KB_EMBEDDING_PROVIDER,
} from './embeddings';
import { createHash } from 'node:crypto';
import type { AlgoliaDocsRecord } from '@/lib/search-index';
import {
  KNOWLEDGE_SOURCE_LABELS,
  type KnowledgeSourceType,
  type ProductAreaSlug,
} from './types';

export interface KnowledgeSemanticRecord {
  objectID: string;
  sourceType: Extract<KnowledgeSourceType, 'docs' | 'kb'>;
  sourceLabel: string;
  pageID: string;
  title: string;
  section: string | null;
  description: string;
  content: string;
  canonicalUrl: string;
  breadcrumbs: string[];
  productAreas: ProductAreaSlug[];
  toolkitSlugs: string[];
  keywords: string[];
  slug: string;
  toolNames: string[];
  toolSlugs: string[];
  pageRank: number;
  sectionRank: number;
  lastVerifiedAt: string | null;
  contentHash: string;
  visibility: 'public';
}

/** @deprecated Use KnowledgeSemanticRecord. */
export type KbSemanticRecord = KnowledgeSemanticRecord;

export interface KnowledgeSemanticArtifact {
  formatVersion: 2;
  provider: typeof KB_EMBEDDING_PROVIDER;
  model: typeof KB_EMBEDDING_MODEL;
  dimensions: number;
  source: {
    repository: string;
    supportKnowledgeCommit: string;
    docsContentHash: string;
  };
  builtAt: string;
  records: KnowledgeSemanticRecord[];
  vectorsBase64: string;
}

/** @deprecated Use KnowledgeSemanticArtifact. */
export type KbSemanticArtifact = KnowledgeSemanticArtifact;

export interface RankedSemanticCandidate {
  record: KnowledgeSemanticRecord;
  rank: number;
  similarity: number;
}

export function semanticRecordFromSearchRecord(record: AlgoliaDocsRecord): KnowledgeSemanticRecord {
  if (record.source_type !== 'kb' && record.source_type !== 'docs') {
    throw new Error(`Only public docs and KB records can be embedded: ${record.objectID}`);
  }
  return {
    objectID: record.objectID,
    sourceType: record.source_type,
    sourceLabel: KNOWLEDGE_SOURCE_LABELS[record.source_type],
    pageID: record.page_id,
    title: record.title,
    section: record.section ?? null,
    description: record.description ?? '',
    content: record.content,
    canonicalUrl: record.canonical_url,
    breadcrumbs: record.breadcrumbs ?? [],
    productAreas: record.product_areas,
    toolkitSlugs: record.toolkit_slugs,
    keywords: record.keywords ?? [],
    slug: record.slug ?? '',
    toolNames: record.tool_names ?? [],
    toolSlugs: record.tool_slugs ?? [],
    pageRank: record.page_rank,
    sectionRank: record.section_rank,
    lastVerifiedAt: record.last_verified_at,
    contentHash: embeddingContentHash(record),
    visibility: 'public',
  };
}

export function docsContentHashFromRecords(records: readonly KnowledgeSemanticRecord[]): string {
  const content = records
    .filter(record => record.sourceType === 'docs')
    .sort((left, right) => left.objectID.localeCompare(right.objectID))
    .map(record => `${record.objectID}\u0000${record.contentHash}`)
    .join('\n');
  return createHash('sha256').update(content).digest('hex');
}

export function encodeVectors(vectors: number[][]): string {
  const dimensions = vectors[0]?.length ?? 0;
  if (dimensions === 0 || vectors.some(vector => vector.length !== dimensions)) {
    throw new Error('Semantic vectors must have one consistent non-zero dimension');
  }
  const values = new Float32Array(vectors.length * dimensions);
  let offset = 0;
  for (const vector of vectors) {
    for (const value of vector) {
      if (!Number.isFinite(value)) throw new Error('Semantic vector contains a non-finite value');
      values[offset++] = value;
    }
  }
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength).toString('base64');
}

export function decodeVectors(
  vectorsBase64: string,
  recordCount: number,
  dimensions: number,
): Float32Array {
  const bytes = Buffer.from(vectorsBase64, 'base64');
  const expectedBytes = recordCount * dimensions * Float32Array.BYTES_PER_ELEMENT;
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`Semantic vector byte length mismatch: expected ${expectedBytes}, got ${bytes.byteLength}`);
  }
  const values = new Float32Array(recordCount * dimensions);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }
  return values;
}

export function validateSemanticArtifact(
  artifact: KnowledgeSemanticArtifact,
  expected: {
    dimensions?: number;
    supportKnowledgeCommit?: string;
    /** @deprecated Use supportKnowledgeCommit. */
    sourceCommit?: string;
    docsContentHash?: string;
    contentHashes?: ReadonlyMap<string, string>;
  },
): KnowledgeSemanticArtifact {
  if (artifact.formatVersion !== 2) throw new Error('Semantic artifact format mismatch');
  if (artifact.provider !== KB_EMBEDDING_PROVIDER) throw new Error('Semantic artifact provider mismatch');
  if (artifact.model !== KB_EMBEDDING_MODEL) throw new Error('Semantic artifact model mismatch');
  if (artifact.dimensions !== (expected.dimensions ?? KB_EMBEDDING_DIMENSIONS)) {
    throw new Error('Semantic artifact dimension mismatch');
  }
  if (artifact.source.repository !== 'ComposioHQ/support-knowledge') {
    throw new Error('Semantic artifact source repository mismatch');
  }
  const supportKnowledgeCommit = expected.supportKnowledgeCommit ?? expected.sourceCommit;
  if (!supportKnowledgeCommit || artifact.source.supportKnowledgeCommit !== supportKnowledgeCommit) {
    throw new Error('Semantic artifact source commit mismatch');
  }
  if (expected.docsContentHash && artifact.source.docsContentHash !== expected.docsContentHash) {
    throw new Error('Semantic artifact docs content hash mismatch');
  }
  if (artifact.records.length === 0) throw new Error('Semantic artifact has no records');

  const seen = new Set<string>();
  for (const record of artifact.records) {
    if (record.sourceType !== 'docs' && record.sourceType !== 'kb') {
      throw new Error(`Semantic record ${record.objectID} has an invalid source type`);
    }
    if (record.visibility !== 'public') throw new Error(`Semantic record ${record.objectID} is not public`);
    if (!record.objectID || seen.has(record.objectID)) {
      throw new Error(`Semantic artifact has duplicate object ID: ${record.objectID}`);
    }
    seen.add(record.objectID);
    const expectedHash = expected.contentHashes?.get(record.objectID);
    if (expected.contentHashes && expectedHash !== record.contentHash) {
      throw new Error(`Semantic artifact content hash mismatch for ${record.objectID}`);
    }
  }
  if (expected.contentHashes && expected.contentHashes.size !== artifact.records.length) {
    throw new Error('Semantic artifact content hash record count mismatch');
  }

  const vectors = decodeVectors(artifact.vectorsBase64, artifact.records.length, artifact.dimensions);
  for (let row = 0; row < artifact.records.length; row += 1) {
    let squaredNorm = 0;
    const start = row * artifact.dimensions;
    for (let column = 0; column < artifact.dimensions; column += 1) {
      const value = vectors[start + column];
      if (!Number.isFinite(value)) throw new Error('Semantic artifact contains a non-finite vector');
      squaredNorm += value * value;
    }
    if (Math.abs(Math.sqrt(squaredNorm) - 1) > 0.002) {
      throw new Error(`Semantic vector for ${artifact.records[row]?.objectID} is not normalized`);
    }
  }
  return artifact;
}

function normalizeQueryVector(queryVector: number[], dimensions: number): number[] {
  if (queryVector.length !== dimensions) throw new Error('Semantic query vector dimension mismatch');
  if (queryVector.some(value => !Number.isFinite(value))) {
    throw new Error('Semantic query vector contains a non-finite value');
  }
  const norm = Math.sqrt(queryVector.reduce((total, value) => total + value * value, 0));
  if (norm === 0) throw new Error('Semantic query vector has zero norm');
  return queryVector.map(value => value / norm);
}

export function rankSemanticCandidates(
  artifact: KnowledgeSemanticArtifact,
  queryVector: number[],
  limit: number,
  options?: { minimumSimilarity?: number },
): RankedSemanticCandidate[] {
  const query = normalizeQueryVector(queryVector, artifact.dimensions);
  const vectors = decodeVectors(artifact.vectorsBase64, artifact.records.length, artifact.dimensions);
  const scored = artifact.records.map((record, row) => {
    let similarity = 0;
    const start = row * artifact.dimensions;
    for (let column = 0; column < artifact.dimensions; column += 1) {
      similarity += query[column]! * vectors[start + column]!;
    }
    return { record, similarity };
  });
  scored.sort((left, right) =>
    right.similarity - left.similarity || left.record.objectID.localeCompare(right.record.objectID),
  );
  const minimumSimilarity = options?.minimumSimilarity ?? Number.NEGATIVE_INFINITY;
  return scored
    .filter(candidate => candidate.similarity >= minimumSimilarity)
    .slice(0, Math.max(0, limit)).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

export async function buildSemanticArtifact(input: {
  records: AlgoliaDocsRecord[];
  supportKnowledgeCommit?: string;
  /** @deprecated Use supportKnowledgeCommit. */
  sourceCommit?: string;
  docsContentHash?: string;
  builtAt: string;
  previousArtifact?: KnowledgeSemanticArtifact;
  embed: (texts: string[]) => Promise<number[][]>;
}): Promise<KnowledgeSemanticArtifact> {
  const records = [...input.records]
    .sort((left, right) => left.objectID.localeCompare(right.objectID));
  const metadata = records.map(semanticRecordFromSearchRecord);
  const supportKnowledgeCommit = input.supportKnowledgeCommit ?? input.sourceCommit;
  if (!supportKnowledgeCommit) throw new Error('Semantic artifact support-knowledge commit is required');
  const docsContentHash = input.docsContentHash ?? docsContentHashFromRecords(metadata);
  const previousVectors = input.previousArtifact &&
    input.previousArtifact.provider === KB_EMBEDDING_PROVIDER &&
    input.previousArtifact.model === KB_EMBEDDING_MODEL &&
    input.previousArtifact.dimensions === KB_EMBEDDING_DIMENSIONS
    ? decodeVectors(
        input.previousArtifact.vectorsBase64,
        input.previousArtifact.records.length,
        input.previousArtifact.dimensions,
      )
    : null;
  const previousRows = new Map(
    input.previousArtifact?.records.map((record, index) => [record.objectID, { record, index }]) ?? [],
  );

  const vectors = new Array<number[] | undefined>(records.length);
  const missingRows: number[] = [];
  for (let index = 0; index < metadata.length; index += 1) {
    const current = metadata[index]!;
    const previous = previousRows.get(current.objectID);
    if (previous && previousVectors && previous.record.contentHash === current.contentHash) {
      const start = previous.index * KB_EMBEDDING_DIMENSIONS;
      vectors[index] = Array.from(
        previousVectors.subarray(start, start + KB_EMBEDDING_DIMENSIONS),
      );
    } else {
      missingRows.push(index);
    }
  }

  if (missingRows.length > 0) {
    const embedded = await input.embed(missingRows.map(index => embeddingText(records[index]!)));
    if (embedded.length !== missingRows.length) {
      throw new Error('Embedding builder result count mismatch');
    }
    for (let index = 0; index < missingRows.length; index += 1) {
      const vector = embedded[index];
      if (!vector || vector.length !== KB_EMBEDDING_DIMENSIONS) {
        throw new Error('Embedding builder dimension mismatch');
      }
      vectors[missingRows[index]!] = vector;
    }
  }

  if (vectors.some(vector => vector === undefined)) {
    throw new Error('Embedding builder left a record without a vector');
  }
  const artifact: KnowledgeSemanticArtifact = {
    formatVersion: 2,
    provider: KB_EMBEDDING_PROVIDER,
    model: KB_EMBEDDING_MODEL,
    dimensions: KB_EMBEDDING_DIMENSIONS,
    source: {
      repository: 'ComposioHQ/support-knowledge',
      supportKnowledgeCommit,
      docsContentHash,
    },
    builtAt: input.builtAt,
    records: metadata,
    vectorsBase64: encodeVectors(vectors as number[][]),
  };
  return validateSemanticArtifact(artifact, {
    supportKnowledgeCommit,
    docsContentHash,
    contentHashes: new Map(metadata.map(record => [record.objectID, record.contentHash])),
  });
}
