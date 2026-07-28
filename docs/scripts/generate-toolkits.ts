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
import { fetchWithRetry } from './fetch-with-retry';
import { requireProductionApiV3Url, stripStagingHosts } from './production-api.mjs';
import { applyToolkitVersions, fetchProductionToolkitVersions } from './toolkit-versions';
import {
  toBoolean,
  toNumber,
  toOptionalString,
  toString,
  toStringArray,
  toUnknownRecord,
  toUnknownRecordArray,
} from '../lib/unknown-value';

const API_BASE = requireProductionApiV3Url(process.env.COMPOSIO_API_BASE);
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
  composioManagedAuthSchemes?: string[];
  toolCount: number;
  triggerCount: number;
  version: string | null;
  tools: Tool[];
  triggers: Trigger[];
  authConfigDetails?: AuthConfigDetail[];
}

// The backend silently caps `limit` at 1000 per page and defaults to usage
// ordering, so a single request returns only the top-1000 toolkits — about half
// the catalog. Request the cap and follow `next_cursor` until exhausted.
// MAX_PAGES is a runaway guard well above the real catalog (~2.1k → 3 pages).
const TOOLKITS_PAGE_LIMIT = 1000;
const TOOLKITS_MAX_PAGES = 12;

async function fetchToolkits(): Promise<unknown[]> {
  console.log('Fetching toolkits from API...');

  const items: unknown[] = [];
  // Pages can overlap when the catalog shifts between cursor fetches; keep the
  // first occurrence so API-provided ordering stays stable.
  const seen = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < TOOLKITS_MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(TOOLKITS_PAGE_LIMIT) });
    if (cursor) params.set('cursor', cursor);

    const response = await fetchWithRetry(`${API_BASE}/toolkits?${params}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY!,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch toolkits: ${response.status} ${response.statusText}`);
    }

    const data: unknown = await response.json();
    const dataRecord = toUnknownRecord(data);
    const pageItems = Array.isArray(dataRecord.items)
      ? dataRecord.items
      : Array.isArray(data)
        ? data
        : [];
    for (const item of pageItems) {
      const slug = toOptionalString(toUnknownRecord(item).slug)?.toLowerCase();
      if (slug) {
        if (seen.has(slug)) continue;
        seen.add(slug);
      }
      items.push(item);
    }

    cursor = toOptionalString(dataRecord.next_cursor);
    if (!cursor) return items;
  }

  // Failing beats silently publishing a truncated catalog — that is the exact
  // bug this pagination loop exists to prevent.
  throw new Error(
    `Toolkit catalog exceeds ${TOOLKITS_MAX_PAGES} pages of ${TOOLKITS_PAGE_LIMIT}; raise TOOLKITS_MAX_PAGES`
  );
}

async function fetchToolsForToolkit(slug: string): Promise<Tool[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/tools?toolkit_slug=${slug}&toolkit_versions=latest&limit=1000`,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY!,
      },
    }
  );

  if (!response.ok) return [];

  const data: unknown = await response.json();
  const rawItems = toUnknownRecord(data).items || data;
  const items = Array.isArray(rawItems) ? rawItems : [];

  return toUnknownRecordArray(items).map(raw => {
    const slug = toString(raw.slug);
    return {
      slug,
      name: toOptionalString(raw.name) ?? toOptionalString(raw.display_name) ?? slug,
      description: toString(raw.description),
    };
  });
}

async function fetchTriggersForToolkit(slug: string): Promise<Trigger[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/triggers_types?toolkit_slugs=${slug}&toolkit_versions=latest`,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY!,
      },
    }
  );

  if (!response.ok) return [];

  const data: unknown = await response.json();
  const rawItems = toUnknownRecord(data).items || data;
  const items = Array.isArray(rawItems) ? rawItems : [];

  return toUnknownRecordArray(items).map(raw => {
    const slug = toString(raw.slug);
    return {
      slug,
      name: toOptionalString(raw.name) ?? toOptionalString(raw.display_name) ?? slug,
      description: toString(raw.description),
    };
  });
}

function transformAuthConfigField(value: unknown, required: boolean): AuthConfigField {
  const field = toUnknownRecord(value);
  const name = toString(field.name);
  const defaultValue =
    typeof field.default === 'string' || field.default === null ? field.default : null;

  return {
    name,
    displayName: toOptionalString(field.displayName) ?? name,
    type: toString(field.type, 'string'),
    description: toString(field.description),
    required: toBoolean(field.required, required),
    default: defaultValue,
  };
}

function authConfigFields(
  raw: Record<string, unknown>,
  phase: 'auth_config_creation' | 'connected_account_initiation',
  requirement: 'required' | 'optional'
): AuthConfigField[] {
  const fields = toUnknownRecord(raw.fields);
  const phaseFields = toUnknownRecord(fields[phase]);
  return (Array.isArray(phaseFields[requirement]) ? phaseFields[requirement] : []).map(field =>
    transformAuthConfigField(field, requirement === 'required')
  );
}

async function fetchAuthConfigDetails(slug: string): Promise<AuthConfigDetail[]> {
  const response = await fetchWithRetry(`${API_BASE}/toolkits/${slug}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) return [];

  const data: unknown = await response.json();
  const authConfigDetails = toUnknownRecordArray(toUnknownRecord(data).auth_config_details);

  return authConfigDetails.map(raw => ({
    mode: toString(raw.mode),
    name: toOptionalString(raw.name) ?? toString(raw.mode),
    fields: {
      auth_config_creation: {
        required: authConfigFields(raw, 'auth_config_creation', 'required'),
        optional: authConfigFields(raw, 'auth_config_creation', 'optional'),
      },
      connected_account_initiation: {
        required: authConfigFields(raw, 'connected_account_initiation', 'required'),
        optional: authConfigFields(raw, 'connected_account_initiation', 'optional'),
      },
    },
  }));
}

function transformToolkit(raw: unknown): Toolkit {
  const toolkit = toUnknownRecord(raw);
  const meta = toUnknownRecord(toolkit.meta);
  const categories = Array.isArray(meta.categories) ? meta.categories : [];
  const firstCategory = categories[0];
  const category =
    typeof firstCategory === 'string'
      ? firstCategory
      : (toOptionalString(toUnknownRecord(firstCategory).name) ?? null);
  const authSchemes = toStringArray(toolkit.auth_schemes || toolkit.authSchemes);
  const composioManaged = toStringArray(
    toolkit.composio_managed_auth_schemes || toolkit.composioManagedAuthSchemes
  );
  const slug = toString(toolkit.slug).toLowerCase();

  return {
    slug,
    name: toOptionalString(toolkit.name) ?? slug,
    logo: toOptionalString(meta.logo) ?? toOptionalString(toolkit.logo) ?? null,
    description: toOptionalString(meta.description) ?? toString(toolkit.description),
    category,
    authSchemes,
    ...(composioManaged.length > 0 ? { composioManagedAuthSchemes: composioManaged } : {}),
    toolCount: toNumber(toolkit.tool_count || toolkit.toolCount),
    triggerCount: toNumber(toolkit.trigger_count || toolkit.triggerCount),
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
    fetchProductionToolkitVersions(API_KEY!),
  ]);
  console.log(`Found ${rawToolkits.length} toolkits\n`);

  // Transform toolkits
  const toolkits: Toolkit[] = rawToolkits.map(transformToolkit);

  // Add versions from changelog
  applyToolkitVersions(toolkits, versionMap);

  // Fetch tools, triggers, and auth config details for each toolkit in batches.
  // Each toolkit fires 3 requests in parallel, so batchSize N = ~3N concurrent
  // requests. Kept low to soften burst pressure on the backend rate limit;
  // fetchWithRetry handles the remaining 429s with backoff.
  console.log('Fetching tools, triggers, and auth config details...');
  const batchSize = 5;
  let completed = 0;

  for (let i = 0; i < toolkits.length; i += batchSize) {
    const batch = toolkits.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async toolkit => {
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

  // Write full file (for detail pages - read from filesystem).
  // Defense in depth: rewrite any staging host embedded in production data so
  // auth-config `default` URLs cannot publish staging endpoints. The light file
  // below carries no URLs.
  await writeFile(
    join(OUTPUT_DIR, 'toolkits.json'),
    stripStagingHosts(JSON.stringify(toolkits, null, 2))
  );

  // Write light file (for landing page - imported in client component)
  // Excludes tools and triggers arrays to keep bundle size small
  const toolkitsLight = toolkits.map(({ slug, name, logo, category, toolCount, triggerCount }) => ({
    slug,
    name,
    logo,
    category,
    toolCount,
    triggerCount,
  }));
  await writeFile(join(OUTPUT_DIR, 'toolkits-list.json'), JSON.stringify(toolkitsLight, null, 2));

  const fullSizeKB = Math.round(JSON.stringify(toolkits).length / 1024);
  const lightSizeKB = Math.round(JSON.stringify(toolkitsLight).length / 1024);
  console.log('Generation complete!');
  console.log(`  Full: public/data/toolkits.json (~${fullSizeKB}KB)`);
  console.log(`  Light: public/data/toolkits-list.json (~${lightSizeKB}KB)`);
  console.log(`  Toolkits: ${toolkits.length}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
