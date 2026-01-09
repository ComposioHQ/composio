/**
 * Toolkit Data Reader
 *
 * Reads toolkit data from gzipped JSON files.
 * - Index page uses lightweight toolkits.json.gz
 * - Detail pages load individual toolkit files on-demand
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import type { Toolkit, ToolkitSummary } from '@/types/toolkit';

const DATA_DIR = join(process.cwd(), 'public/data');
const TOOLKITS_DIR = join(DATA_DIR, 'toolkits');
const INDEX_FILE = join(DATA_DIR, 'toolkits.json.gz');

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
 * Read and decompress a gzipped JSON file
 */
async function readGzippedJson<T>(filePath: string): Promise<T> {
  const compressed = await readFile(filePath);
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Check if toolkit data has been generated
 */
export function isToolkitDataGenerated(): boolean {
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
    const filePath = join(TOOLKITS_DIR, `${slug.toLowerCase()}.json.gz`);
    return await readGzippedJson<Toolkit>(filePath);
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
    return await readGzippedJson<ToolkitSummary[]>(INDEX_FILE);
  } catch (error) {
    console.error('[toolkit-data] Failed to parse toolkit data:', error);
    throw new ToolkitDataError(
      'Failed to parse toolkit data. Try regenerating: FORCE_TOOLKIT_REGEN=true bun run generate:toolkits',
      'PARSE_ERROR'
    );
  }
}
