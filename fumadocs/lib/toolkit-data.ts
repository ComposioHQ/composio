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
 * Check if toolkit data has been generated (local dev only)
 * On Vercel, we skip this check and let file reads fail gracefully
 */
export function isToolkitDataGenerated(): boolean {
  // On Vercel, assume data exists (was generated at build time)
  if (process.env.VERCEL) return true;
  return existsSync(INDEX_FILE) && existsSync(TOOLKITS_DIR);
}

/**
 * Get detailed toolkit data by slug
 * Loads from individual gzipped JSON file
 */
export async function getToolkitBySlug(slug: string): Promise<Toolkit | null> {
  try {
    const filePath = join(TOOLKITS_DIR, `${slug.toLowerCase()}.json.gz`);
    return await readGzippedJson<Toolkit>(filePath);
  } catch (error) {
    console.error(`[toolkit-data] Failed to load toolkit ${slug}:`, error);
    // File not found or read error
    return null;
  }
}

/**
 * Get all toolkit summaries (lightweight, from gzipped JSON file)
 * Returns empty array if data not generated (graceful degradation)
 */
export async function getToolkitSummaries(): Promise<ToolkitSummary[]> {
  try {
    return await readGzippedJson<ToolkitSummary[]>(INDEX_FILE);
  } catch (error) {
    console.error('[toolkit-data] Failed to load toolkit summaries:', error);
    // Return empty array for graceful degradation
    return [];
  }
}
