import { createHash } from 'node:crypto';
import type { AlgoliaDocsRecord } from '@/lib/search-index';

export const KB_EMBEDDING_PROVIDER = 'openai' as const;
export const KB_EMBEDDING_MODEL = 'text-embedding-3-small' as const;
export const KB_EMBEDDING_DIMENSIONS = 256;

function compact(values: Array<string | undefined>): string[] {
  return values.map(value => value?.trim()).filter((value): value is string => Boolean(value));
}

export function embeddingText(record: AlgoliaDocsRecord): string {
  const exactTerms = compact([
    ...(record.keywords ?? []),
    record.slug,
    ...(record.tool_names ?? []),
    ...(record.tool_slugs ?? []),
  ]);
  const lines = compact([
    `Title: ${record.title}`,
    record.section ? `Section: ${record.section}` : undefined,
    record.description ? `Description: ${record.description}` : undefined,
    exactTerms.length > 0 ? `Aliases and exact terms: ${exactTerms.join(' | ')}` : undefined,
    record.toolkit_slugs.length > 0 ? `Toolkits: ${record.toolkit_slugs.join(' | ')}` : undefined,
    `Content: ${record.content}`,
  ]);
  return lines.join('\n');
}

export function embeddingContentHash(record: AlgoliaDocsRecord): string {
  return createHash('sha256').update(embeddingText(record), 'utf8').digest('hex');
}

function normalized(vector: unknown, expectedDimensions?: number): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Embedding response vector is empty');
  }
  if (expectedDimensions !== undefined && vector.length !== expectedDimensions) {
    throw new Error(`Embedding response dimension mismatch: expected ${expectedDimensions}, got ${vector.length}`);
  }
  const values = vector.map(value => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Embedding response contains a non-finite value');
    }
    return value;
  });
  const norm = Math.sqrt(values.reduce((total, value) => total + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Embedding response vector has zero norm');
  return values.map(value => value / norm);
}

interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: unknown }>;
  error?: { message?: string };
}

export async function embedTexts(
  texts: string[],
  options: {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
    signal?: AbortSignal;
  },
): Promise<number[][]> {
  if (!options.apiKey.trim()) throw new Error('OpenAI embedding API key is missing');
  if (texts.length === 0) return [];
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const response = await fetchImplementation('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: KB_EMBEDDING_MODEL,
      dimensions: KB_EMBEDDING_DIMENSIONS,
      encoding_format: 'float',
      input: texts,
    }),
    signal: options.signal,
  });
  const body = await response.json() as EmbeddingResponse;
  if (!response.ok) {
    throw new Error(`OpenAI embedding request failed with HTTP ${response.status}`);
  }
  if (!Array.isArray(body.data) || body.data.length !== texts.length) {
    throw new Error('Embedding response record count mismatch');
  }

  const ordered = new Array<number[]>(texts.length);
  for (const item of body.data) {
    if (!Number.isInteger(item.index) || (item.index ?? -1) < 0 || (item.index ?? -1) >= texts.length) {
      throw new Error('Embedding response index is invalid');
    }
    if (ordered[item.index!] !== undefined) throw new Error('Embedding response index is duplicated');
    ordered[item.index!] = normalized(item.embedding);
  }
  if (ordered.some(vector => vector === undefined)) {
    throw new Error('Embedding response index is missing');
  }
  return ordered;
}
