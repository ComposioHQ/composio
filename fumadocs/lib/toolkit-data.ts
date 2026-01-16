/**
 * Toolkit Data Reader
 *
 * Reads toolkit data from gzipped JSON files.
 * - Index page uses lightweight toolkits.json.gz
 * - Detail pages load individual toolkit files on-demand
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import type { Toolkit, ToolkitSummary } from '@/types/toolkit';

const DATA_DIR = join(process.cwd(), 'public/data');
const TOOLKITS_DIR = join(DATA_DIR, 'toolkits');
const INDEX_FILE = join(DATA_DIR, 'toolkits.json.gz');

/**
 * Read and decompress a gzipped JSON file
 */
async function readGzippedJson<T>(filePath: string): Promise<T> {
  const compressed = await readFile(filePath);
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString('utf-8'));
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
