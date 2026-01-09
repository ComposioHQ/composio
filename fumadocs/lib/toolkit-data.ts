/**
 * Toolkit Data Reader
 *
 * Reads toolkit data from gzipped JSON files.
 * - Index page uses lightweight toolkits.json.gz
 * - Detail pages load individual toolkit files on-demand
 *
 * On Vercel serverless (SSR), fetches via HTTP since public/ isn't in filesystem.
 * At build time, reads directly from filesystem.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import type { Toolkit, ToolkitSummary } from '@/types/toolkit';

const DATA_DIR = join(process.cwd(), 'public/data');
const TOOLKITS_DIR = join(DATA_DIR, 'toolkits');
const INDEX_FILE = join(DATA_DIR, 'toolkits.json.gz');

// On Vercel serverless runtime, public/ isn't accessible via filesystem
const isVercelRuntime = process.env.VERCEL && process.env.VERCEL_ENV;
const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

export class ToolkitDataError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_GENERATED' | 'PARSE_ERROR' | 'NOT_FOUND'
  ) {
    super(message);
    this.name = 'ToolkitDataError';
  }
}

/**
 * Read and decompress a gzipped JSON file from filesystem
 */
async function readGzippedJsonFromFs<T>(filePath: string): Promise<T> {
  const compressed = await readFile(filePath);
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Fetch and decompress a gzipped JSON file via HTTP
 */
async function fetchGzippedJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const decompressed = gunzipSync(Buffer.from(buffer));
  return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Check if toolkit data has been generated (filesystem check, build-time only)
 */
export function isToolkitDataGenerated(): boolean {
  // On Vercel runtime, assume data exists (was generated at build time)
  if (isVercelRuntime) return true;
  return existsSync(INDEX_FILE) && existsSync(TOOLKITS_DIR);
}

/**
 * Get detailed toolkit data by slug
 * Loads from individual gzipped JSON file
 */
export async function getToolkitBySlug(slug: string): Promise<Toolkit | null> {
  if (!isToolkitDataGenerated()) {
    throw new ToolkitDataError(
      'Toolkit data not generated. Run: bun run generate:toolkits',
      'NOT_GENERATED'
    );
  }

  try {
    const slugLower = slug.toLowerCase();

    // On Vercel runtime, fetch via HTTP
    if (isVercelRuntime && VERCEL_URL) {
      return await fetchGzippedJson<Toolkit>(`${VERCEL_URL}/data/toolkits/${slugLower}.json.gz`);
    }

    // At build time or locally, read from filesystem
    const filePath = join(TOOLKITS_DIR, `${slugLower}.json.gz`);
    return await readGzippedJsonFromFs<Toolkit>(filePath);
  } catch (error) {
    // File not found - toolkit doesn't exist
    return null;
  }
}

/**
 * Get all toolkit summaries (lightweight, from gzipped JSON file)
 * Returns empty array if data not generated (graceful degradation)
 */
export async function getToolkitSummaries(): Promise<ToolkitSummary[]> {
  if (!isToolkitDataGenerated()) {
    console.warn('[toolkit-data] Data not generated. Run: bun run generate:toolkits');
    return [];
  }

  try {
    // On Vercel runtime, fetch via HTTP
    if (isVercelRuntime && VERCEL_URL) {
      return await fetchGzippedJson<ToolkitSummary[]>(`${VERCEL_URL}/data/toolkits.json.gz`);
    }

    // At build time or locally, read from filesystem
    return await readGzippedJsonFromFs<ToolkitSummary[]>(INDEX_FILE);
  } catch (error) {
    console.error('[toolkit-data] Failed to parse toolkit data:', error);
    throw new ToolkitDataError(
      'Failed to parse toolkit data. Try regenerating: FORCE_TOOLKIT_REGEN=true bun run generate:toolkits',
      'PARSE_ERROR'
    );
  }
}
