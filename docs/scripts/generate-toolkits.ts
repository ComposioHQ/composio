/**
 * Toolkit Generator Script
 *
 * Fetches all toolkits from Composio API and generates:
 * - /public/data/toolkits.json (full data with tools & triggers - for detail pages)
 * - /public/data/toolkits-list.json (light version without tools/triggers - for landing page)
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

interface Tool {
  slug: string;
  name: string;
  description: string;
}

interface Trigger {
  slug: string;
  name: string;
  description: string;
}

interface AuthConfigField {
  name: string;
  displayName: string;
  type: string;
  description: string;
  required: boolean;
  default?: string | null;
}

interface AuthConfigDetail {
  mode: string;
  name: string;
  fields: {
    auth_config_creation: {
      required: AuthConfigField[];
      optional: AuthConfigField[];
    };
    connected_account_initiation: {
      required: AuthConfigField[];
      optional: AuthConfigField[];
    };
  };
}

interface Toolkit {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  category: string | null;
  authSchemes: string[];
  toolCount: number;
  triggerCount: number;
  version: string | null;
  tools: Tool[];
  triggers: Trigger[];
  authConfigDetails?: AuthConfigDetail[];
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

  // Response format: { items: [{ slug, name, display_name, versions: [{ version, changelog }] }] }
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

async function fetchToolsForToolkit(slug: string): Promise<Tool[]> {
  const response = await fetch(`${API_BASE}/tools?toolkit_slug=${slug}&limit=1000`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  const rawItems = data.items || data;
  const items = Array.isArray(rawItems) ? rawItems : [];

  return items.filter((raw: any) => raw && typeof raw === 'object').map((raw: any) => ({
    slug: raw.slug || '',
    name: raw.name || raw.display_name || raw.slug || '',
    description: raw.description || '',
  }));
}

async function fetchTriggersForToolkit(slug: string): Promise<Trigger[]> {
  const response = await fetch(`${API_BASE}/triggers_types?toolkit_slugs=${slug}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  const rawItems = data.items || data;
  const items = Array.isArray(rawItems) ? rawItems : [];

  return items.filter((raw: any) => raw && typeof raw === 'object').map((raw: any) => ({
    slug: raw.slug || '',
    name: raw.name || raw.display_name || raw.slug || '',
    description: raw.description || '',
  }));
}

async function fetchAuthConfigDetails(slug: string): Promise<AuthConfigDetail[]> {
  const response = await fetch(`${API_BASE}/toolkits/${slug}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  const authConfigDetails = data.auth_config_details || [];

  return authConfigDetails.map((raw: any) => ({
    mode: raw.mode || '',
    name: raw.name || raw.mode || '',
    fields: {
      auth_config_creation: {
        required: (raw.fields?.auth_config_creation?.required || []).map((f: any) => ({
          name: f.name || '',
          displayName: f.displayName || f.name || '',
          type: f.type || 'string',
          description: f.description || '',
          required: f.required ?? true,
          default: f.default ?? null,
        })),
        optional: (raw.fields?.auth_config_creation?.optional || []).map((f: any) => ({
          name: f.name || '',
          displayName: f.displayName || f.name || '',
          type: f.type || 'string',
          description: f.description || '',
          required: f.required ?? false,
          default: f.default ?? null,
        })),
      },
      connected_account_initiation: {
        required: (raw.fields?.connected_account_initiation?.required || []).map((f: any) => ({
          name: f.name || '',
          displayName: f.displayName || f.name || '',
          type: f.type || 'string',
          description: f.description || '',
          required: f.required ?? true,
          default: f.default ?? null,
        })),
        optional: (raw.fields?.connected_account_initiation?.optional || []).map((f: any) => ({
          name: f.name || '',
          displayName: f.displayName || f.name || '',
          type: f.type || 'string',
          description: f.description || '',
          required: f.required ?? false,
          default: f.default ?? null,
        })),
      },
    },
  }));
}

function transformToolkit(raw: any): Toolkit {
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
    tools: [],
    triggers: [],
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

  // Transform toolkits
  const toolkits: Toolkit[] = rawToolkits.map(transformToolkit);

  // Add versions from changelog
  for (const toolkit of toolkits) {
    toolkit.version = versionMap.get(toolkit.slug) || null;
  }

  // Fetch tools, triggers, and auth config details for each toolkit in batches
  console.log('Fetching tools, triggers, and auth config details...');
  const batchSize = 10;
  let completed = 0;

  for (let i = 0; i < toolkits.length; i += batchSize) {
    const batch = toolkits.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (toolkit) => {
        const [tools, triggers, authConfigDetails] = await Promise.all([
          fetchToolsForToolkit(toolkit.slug.toUpperCase()),
          fetchTriggersForToolkit(toolkit.slug.toUpperCase()),
          fetchAuthConfigDetails(toolkit.slug),
        ]);

        toolkit.tools = tools;
        toolkit.triggers = triggers;
        toolkit.toolCount = tools.length;
        toolkit.triggerCount = triggers.length;
        toolkit.authConfigDetails = authConfigDetails.length > 0 ? authConfigDetails : undefined;

        completed++;
        process.stdout.write(`\r  Progress: ${completed}/${toolkits.length}`);
      })
    );
  }

  console.log('\n');

  // Write full file (for detail pages - read from filesystem)
  await writeFile(
    join(OUTPUT_DIR, 'toolkits.json'),
    JSON.stringify(toolkits, null, 2)
  );

  // Write light file (for landing page - imported in client component)
  // Excludes tools and triggers arrays to keep bundle size small
  const toolkitsLight = toolkits.map(({ tools, triggers, ...rest }) => rest);
  await writeFile(
    join(OUTPUT_DIR, 'toolkits-list.json'),
    JSON.stringify(toolkitsLight, null, 2)
  );

  const fullSizeKB = Math.round(JSON.stringify(toolkits).length / 1024);
  const lightSizeKB = Math.round(JSON.stringify(toolkitsLight).length / 1024);
  console.log('Generation complete!');
  console.log(`  Full: public/data/toolkits.json (~${fullSizeKB}KB)`);
  console.log(`  Light: public/data/toolkits-list.json (~${lightSizeKB}KB)`);
  console.log(`  Toolkits: ${toolkits.length}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
