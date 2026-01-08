/**
 * Toolkit Generator Script
 *
 * Fetches all toolkits from Composio API and generates:
 * - /public/data/toolkits.json (lightweight list for index page)
 *
 * Detailed toolkit data (tools, triggers, auth) is fetched dynamically
 * on individual toolkit pages.
 *
 * Run: bun run generate:toolkits
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;

if (!API_KEY) {
  console.error('Error: COMPOSIO_API_KEY environment variable is required');
  process.exit(1);
}

const OUTPUT_DIR = join(process.cwd(), 'public/data');

// Lightweight toolkit info for list page
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

function transformToolkit(raw: any): ToolkitSummary {
  return {
    slug: raw.slug?.toLowerCase() || '',
    name: raw.name || raw.slug || '',
    logo: raw.meta?.logo || raw.logo || null,
    description: raw.meta?.description || raw.description || '',
    category: raw.meta?.categories?.[0]?.name || raw.meta?.categories?.[0] || null,
    authSchemes: raw.auth_schemes || raw.authSchemes || [],
    toolCount: raw.tool_count || raw.toolCount || 0,
    triggerCount: raw.trigger_count || raw.triggerCount || 0,
    version: null,
  };
}

async function main() {
  console.log('Starting toolkit generation...\n');

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Fetch all toolkits and changelog in parallel
  const [rawToolkits, versionMap] = await Promise.all([
    fetchToolkits(),
    fetchToolkitChangelog(),
  ]);
  console.log(`Found ${rawToolkits.length} toolkits\n`);

  // Transform toolkits (lightweight)
  const toolkits: ToolkitSummary[] = rawToolkits.map(transformToolkit);

  // Add versions from changelog
  for (const toolkit of toolkits) {
    toolkit.version = versionMap.get(toolkit.slug) || null;
  }

  // Write lightweight file
  await writeFile(
    join(OUTPUT_DIR, 'toolkits.json'),
    JSON.stringify(toolkits, null, 2)
  );

  const fileSizeKB = Math.round(JSON.stringify(toolkits).length / 1024);
  console.log('Generation complete!');
  console.log(`  Output: public/data/toolkits.json`);
  console.log(`  Toolkits: ${toolkits.length}`);
  console.log(`  File size: ~${fileSizeKB}KB`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
