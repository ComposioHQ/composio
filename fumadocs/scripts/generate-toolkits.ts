/**
 * Toolkit Generator Script
 *
 * Fetches all toolkits from Composio API and generates:
 * - /public/data/toolkits.json.gz (lightweight list for index page)
 * - /public/data/toolkits/{slug}.json.gz (individual gzipped files for detail pages)
 *
 * Run: bun run generate:toolkits
 *
 * Caching: Skips generation if data already exists.
 * Set FORCE_TOOLKIT_REGEN=true to force regeneration.
 */

import { mkdir, writeFile, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;

// Always regenerate on production for fresh data
const isProduction = process.env.VERCEL_ENV === 'production';
const FORCE_REGEN = isProduction || process.env.FORCE_TOOLKIT_REGEN === 'true';

const OUTPUT_DIR = join(process.cwd(), 'public/data');
const INDEX_FILE = join(OUTPUT_DIR, 'toolkits.json.gz');
const TOOLKITS_DIR = join(OUTPUT_DIR, 'toolkits');

// Vercel caches .next/cache between builds
const CACHE_DIR = join(process.cwd(), '.next/cache/toolkit-data');
const CACHE_INDEX = join(CACHE_DIR, 'toolkits.json.gz');
const CACHE_TOOLKITS = join(CACHE_DIR, 'toolkits');

// Log environment
if (isProduction) {
  console.log('Production build - regenerating fresh toolkit data');
}

// Check if output already exists
if (!FORCE_REGEN && existsSync(INDEX_FILE) && existsSync(TOOLKITS_DIR)) {
  console.log('✓ Toolkit data already exists, skipping generation');
  console.log('  Set FORCE_TOOLKIT_REGEN=true to force regeneration');
  process.exit(0);
}

// Check if we can restore from Vercel's build cache (preview only)
if (!FORCE_REGEN && existsSync(CACHE_INDEX) && existsSync(CACHE_TOOLKITS)) {
  console.log('✓ Preview build - restoring toolkit data from cache...');
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(TOOLKITS_DIR, { recursive: true });

  // Copy from cache to public
  const { cpSync } = await import('fs');
  cpSync(CACHE_INDEX, INDEX_FILE);
  cpSync(CACHE_TOOLKITS, TOOLKITS_DIR, { recursive: true });

  console.log('✓ Restored from cache');
  process.exit(0);
}

if (!API_KEY) {
  console.error('Error: COMPOSIO_API_KEY environment variable is required');
  process.exit(1);
}

// Types
interface ToolkitSummary {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  category: string | null;
  authSchemes: string[];
  toolCount: number;
  triggerCount: number;
  version: string | null;
}

interface Tool {
  slug: string;
  name: string;
  description: string;
  inputParameters?: ParametersSchema;
  outputParameters?: ParametersSchema;
}

interface Trigger {
  slug: string;
  name: string;
  description: string;
  payload?: ParametersSchema;
}

interface ParametersSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

interface AuthField {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
}

interface AuthConfigDetail {
  name: string;
  mode: string;
  fields: {
    auth_config_creation?: { required: AuthField[]; optional: AuthField[] };
    connected_account_initiation?: { required: AuthField[]; optional: AuthField[] };
  };
}

interface ToolkitFull extends ToolkitSummary {
  tools: Tool[];
  triggers: Trigger[];
  authConfigDetails: AuthConfigDetail[];
}

// API Fetching Functions
async function fetchToolkits(): Promise<any[]> {
  console.log('Fetching toolkits from API...');

  const response = await fetch(`${API_BASE}/toolkits`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch toolkits: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || data;
}

async function fetchToolkitChangelog(): Promise<Map<string, string>> {
  console.log('Fetching toolkit changelog...');

  const response = await fetch(`${API_BASE}/toolkits/changelog`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) {
    console.warn(`Failed to fetch changelog: ${response.status}`);
    return new Map();
  }

  const data = await response.json();
  const versionMap = new Map<string, string>();

  const items = data.items || [];
  for (const entry of items) {
    const slug = entry.slug?.toLowerCase();
    const latestVersion = entry.versions?.[0]?.version;
    if (slug && latestVersion) {
      versionMap.set(slug, latestVersion);
    }
  }

  console.log(`Found versions for ${versionMap.size} toolkits`);
  return versionMap;
}

async function fetchAllItems<T>(
  baseUrl: string,
  params: Record<string, string>,
  transform: (item: any) => T
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;
  const limit = 1000; // API max is 1000

  do {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set('limit', limit.toString());
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY!,
      },
    });

    if (!response.ok) break;

    const data = await response.json();
    const items = data.items || data || [];
    allItems.push(...items.map(transform));

    // Check for next page cursor
    cursor = data.next_cursor || data.nextCursor;
  } while (cursor);

  return allItems;
}

async function fetchToolsForToolkit(slug: string): Promise<Tool[]> {
  return fetchAllItems<Tool>(
    `${API_BASE}/tools`,
    { toolkit_slug: slug, toolkit_versions: 'latest' },
    (raw) => ({
      slug: raw.slug || '',
      name: raw.name || raw.slug || '',
      description: raw.description || '',
      inputParameters: transformSchema(raw.input_parameters),
      outputParameters: transformSchema(raw.output_parameters),
    })
  );
}

async function fetchTriggersForToolkit(slug: string): Promise<Trigger[]> {
  return fetchAllItems<Trigger>(
    `${API_BASE}/triggers_types`,
    { toolkit_slugs: slug, toolkit_versions: 'latest' },
    (raw) => ({
      slug: raw.slug || '',
      name: raw.name || raw.slug || '',
      description: raw.description || '',
      payload: transformSchema(raw.payload),
    })
  );
}

async function fetchToolkitAuthDetails(slug: string): Promise<AuthConfigDetail[]> {
  const response = await fetch(`${API_BASE}/toolkits/${slug}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  const authDetails = data.auth_config_details || [];

  return authDetails.map((raw: any) => ({
    name: raw.name || '',
    mode: raw.mode || '',
    fields: {
      auth_config_creation: raw.fields?.auth_config_creation
        ? {
            required: (raw.fields.auth_config_creation.required || []).map(mapAuthField),
            optional: (raw.fields.auth_config_creation.optional || []).map(mapAuthField),
          }
        : undefined,
      connected_account_initiation: raw.fields?.connected_account_initiation
        ? {
            required: (raw.fields.connected_account_initiation.required || []).map(mapAuthField),
            optional: (raw.fields.connected_account_initiation.optional || []).map(mapAuthField),
          }
        : undefined,
    },
  }));
}

// Transform helpers - trim schema to essential fields only
function trimSchemaProperty(prop: any): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {};

  // Keep only essential fields
  if (prop.type) trimmed.type = prop.type;
  if (prop.description) trimmed.description = prop.description;
  if (prop.enum) trimmed.enum = prop.enum;

  // Handle nested items (arrays)
  if (prop.items) {
    trimmed.items = trimSchemaProperty(prop.items);
  }

  // Handle nested properties (objects)
  if (prop.properties) {
    const trimmedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(prop.properties)) {
      trimmedProps[key] = trimSchemaProperty(value);
    }
    trimmed.properties = trimmedProps;
  }

  return trimmed;
}

function transformSchema(raw: any): ParametersSchema | undefined {
  if (!raw?.properties || Object.keys(raw.properties).length === 0) {
    return undefined;
  }

  // Trim each property to essential fields only
  const trimmedProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw.properties)) {
    trimmedProperties[key] = trimSchemaProperty(value);
  }

  return {
    type: 'object',
    properties: trimmedProperties,
    required: raw.required,
  };
}

function mapAuthField(f: any): AuthField {
  return {
    name: f.name || '',
    displayName: f.displayName || f.display_name || f.name || '',
    type: f.type || 'string',
    required: f.required ?? f.is_required ?? false,
  };
}

function transformToolkitSummary(raw: any): ToolkitSummary {
  return {
    slug: raw.slug?.toLowerCase() || '',
    name: raw.name || raw.slug || '',
    logo: raw.meta?.logo || raw.logo || null,
    description: raw.meta?.description || raw.description || '',
    category: raw.meta?.categories?.[0]?.name || raw.meta?.categories?.[0] || null,
    authSchemes: raw.auth_schemes || raw.authSchemes || [],
    toolCount: raw.meta?.tools_count || raw.tool_count || raw.toolCount || 0,
    triggerCount: raw.meta?.triggers_count || raw.trigger_count || raw.triggerCount || 0,
    version: null,
  };
}

async function main() {
  console.log('Starting toolkit generation...\n');

  // Create output directories
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Clean and recreate toolkits directory
  try {
    await rm(TOOLKITS_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
  await mkdir(TOOLKITS_DIR, { recursive: true });

  // Fetch base data
  const [rawToolkits, versionMap] = await Promise.all([
    fetchToolkits(),
    fetchToolkitChangelog(),
  ]);
  console.log(`Found ${rawToolkits.length} toolkits\n`);

  // Transform to summaries
  const summaries: ToolkitSummary[] = rawToolkits.map(transformToolkitSummary);
  for (const toolkit of summaries) {
    toolkit.version = versionMap.get(toolkit.slug) || null;
  }

  // Write lightweight file for list page (gzipped)
  const indexJson = JSON.stringify(summaries);
  const indexGzipped = gzipSync(indexJson);
  await writeFile(join(OUTPUT_DIR, 'toolkits.json.gz'), indexGzipped);
  console.log(`Written: toolkits.json.gz (${Math.round(indexGzipped.length / 1024)}KB, uncompressed: ${Math.round(indexJson.length / 1024)}KB)`);

  // Fetch full details for each toolkit and write individual files
  console.log('\nFetching detailed data and writing individual files...');
  const batchSize = 50; // Parallel toolkit fetches
  const delayBetweenBatches = 100; // Brief delay to avoid rate limits
  let completed = 0;
  let totalSize = 0;
  let largestFile = { slug: '', size: 0 };

  for (let i = 0; i < summaries.length; i += batchSize) {
    const batch = summaries.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (summary) => {
        const [tools, triggers, authConfigDetails] = await Promise.all([
          fetchToolsForToolkit(summary.slug),
          fetchTriggersForToolkit(summary.slug),
          fetchToolkitAuthDetails(summary.slug),
        ]);

        const fullToolkit: ToolkitFull = {
          ...summary,
          tools,
          triggers,
          authConfigDetails,
          toolCount: tools.length,
          triggerCount: triggers.length,
        };

        // Write individual toolkit file (gzipped)
        const json = JSON.stringify(fullToolkit);
        const gzipped = gzipSync(json);
        const filePath = join(TOOLKITS_DIR, `${summary.slug}.json.gz`);
        await writeFile(filePath, gzipped);

        // Track sizes (compressed)
        const fileSize = gzipped.length;
        totalSize += fileSize;
        if (fileSize > largestFile.size) {
          largestFile = { slug: summary.slug, size: fileSize };
        }

        completed++;
        process.stdout.write(`\r  Progress: ${completed}/${summaries.length}`);
      })
    );

    // Delay between batches to avoid rate limits
    if (i + batchSize < summaries.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  console.log('\n');

  // Save to Vercel build cache for future builds
  console.log('Saving to build cache...');
  const { cpSync } = await import('fs');
  await mkdir(CACHE_DIR, { recursive: true });
  cpSync(INDEX_FILE, CACHE_INDEX);
  cpSync(TOOLKITS_DIR, CACHE_TOOLKITS, { recursive: true });
  console.log('✓ Saved to .next/cache/toolkit-data/');

  // Summary
  console.log('\nGeneration complete!');
  console.log(`  Index file: toolkits.json.gz (${Math.round(indexGzipped.length / 1024)}KB)`);
  console.log(`  Individual files: ${summaries.length} gzipped files in /public/data/toolkits/`);
  console.log(`  Total compressed size: ${Math.round(totalSize / 1024 / 1024)}MB`);
  console.log(`  Largest file: ${largestFile.slug}.json.gz (${Math.round(largestFile.size / 1024)}KB)`);
  console.log(`  Average file size: ${Math.round(totalSize / summaries.length / 1024)}KB`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
