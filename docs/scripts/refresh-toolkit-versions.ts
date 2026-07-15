/**
 * Refresh only the version field in the committed toolkit catalog.
 *
 * This is the narrow, reproducible repair path for version-only incidents. The
 * full `generate-toolkits.ts` script remains the owner of complete catalog
 * regeneration.
 *
 * Run from docs/: bun run generate:toolkit-versions
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  applyToolkitVersions,
  fetchProductionToolkitVersions,
} from './toolkit-versions';

interface Toolkit {
  slug: string;
  version: string | null;
  [key: string]: unknown;
}

const TOOLKITS_PATH = join(process.cwd(), 'public/data/toolkits.json');

export async function refreshToolkitVersions(apiKey: string): Promise<void> {
  const raw = await readFile(TOOLKITS_PATH, 'utf-8');
  const toolkits = JSON.parse(raw) as Toolkit[];

  if (!Array.isArray(toolkits)) {
    throw new Error('Expected public/data/toolkits.json to contain an array');
  }

  const versionMap = await fetchProductionToolkitVersions(apiKey);
  const { matched, missing } = applyToolkitVersions(toolkits, versionMap);

  await writeFile(TOOLKITS_PATH, JSON.stringify(toolkits, null, 2));
  console.log(`Updated ${matched} toolkit versions from production; ${missing} set to null`);
}

if (import.meta.main) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error('Error: COMPOSIO_API_KEY environment variable is required');
    process.exit(1);
  }

  refreshToolkitVersions(apiKey).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
