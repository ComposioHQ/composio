/**
 * Toolkit Generator Script
 *
 * Fetches all toolkits from Composio API and generates:
 * - /public/data/toolkits.json (all toolkits with tools & triggers)
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

interface SchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  required?: boolean;
  enum?: unknown[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

interface ParametersSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
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
    auth_config_creation?: {
      required: AuthField[];
      optional: AuthField[];
    };
    connected_account_initiation?: {
      required: AuthField[];
      optional: AuthField[];
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
  authConfigDetails: AuthConfigDetail[];
  toolCount: number;
  triggerCount: number;
  version: string | null;
  tools: Tool[];
  triggers: Trigger[];
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
  const items = data.items || data || [];

  return items.map((raw: any) => ({
    slug: raw.slug || '',
    name: raw.name || raw.display_name || raw.slug || '',
    description: raw.description || '',
    inputParameters: raw.input_parameters || raw.inputParameters || undefined,
    outputParameters: raw.output_parameters || raw.outputParameters || undefined,
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
  const items = data.items || data || [];

  return items.map((raw: any) => ({
    slug: raw.slug || '',
    name: raw.name || raw.display_name || raw.slug || '',
    description: raw.description || '',
    payload: raw.payload || raw.payload_schema || undefined,
  }));
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

  const mapFields = (fields: any[]): AuthField[] =>
    (fields || []).map((f: any) => ({
      name: f.name || '',
      displayName: f.displayName || f.name || '',
      type: f.type || 'string',
      required: f.required || false,
    }));

  return authDetails.map((raw: any) => ({
    name: raw.name || '',
    mode: raw.mode || '',
    fields: {
      auth_config_creation: raw.fields?.auth_config_creation ? {
        required: mapFields(raw.fields.auth_config_creation.required),
        optional: mapFields(raw.fields.auth_config_creation.optional),
      } : undefined,
      connected_account_initiation: raw.fields?.connected_account_initiation ? {
        required: mapFields(raw.fields.connected_account_initiation.required),
        optional: mapFields(raw.fields.connected_account_initiation.optional),
      } : undefined,
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
    authConfigDetails: [],
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

  // Fetch tools, triggers, and auth details for each toolkit in batches
  console.log('Fetching tools, triggers, and auth details...');
  const batchSize = 10;
  let completed = 0;

  for (let i = 0; i < toolkits.length; i += batchSize) {
    const batch = toolkits.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (toolkit) => {
        const [tools, triggers, authDetails] = await Promise.all([
          fetchToolsForToolkit(toolkit.slug.toUpperCase()),
          fetchTriggersForToolkit(toolkit.slug.toUpperCase()),
          fetchToolkitAuthDetails(toolkit.slug),
        ]);

        toolkit.tools = tools;
        toolkit.triggers = triggers;
        toolkit.authConfigDetails = authDetails;
        toolkit.toolCount = tools.length;
        toolkit.triggerCount = triggers.length;

        completed++;
        process.stdout.write(`\r  Progress: ${completed}/${toolkits.length}`);
      })
    );
  }

  console.log('\n');

  // Write single file
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
