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
import { z } from 'zod';

const API_BASE = requireProductionApiV3Url(process.env.COMPOSIO_API_BASE);
const API_KEY = process.env.COMPOSIO_API_KEY;

const OUTPUT_DIR = join(process.cwd(), 'public/data');
const EXCLUDED_PUBLIC_TOOLKIT_SLUGS = new Set(['test_app']);

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

// Zod schemas for the raw API payloads this script consumes. Parsing is
// lenient on purpose: malformed fields degrade to the same fallbacks the
// hand-written mapping used to apply, so a partially bad catalog entry never
// aborts a full generation run.

/** Optional lenient string array: undefined when absent/non-array, junk members dropped. */
const optionalStringArraySchema = z
  .array(z.unknown())
  .optional()
  .catch(undefined)
  .transform(items =>
    items?.flatMap(item => {
      const parsed = z.string().safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
  );

const rawToolkitSchema = z.object({
  slug: z.string().catch(''),
  name: z.string().optional().catch(undefined),
  logo: z.string().optional().catch(undefined),
  description: z.string().catch(''),
  meta: z
    .object({
      logo: z.string().optional().catch(undefined),
      description: z.string().optional().catch(undefined),
      categories: z.array(z.unknown()).catch([]),
    })
    .catch({ logo: undefined, description: undefined, categories: [] }),
  auth_schemes: optionalStringArraySchema,
  authSchemes: optionalStringArraySchema,
  composio_managed_auth_schemes: optionalStringArraySchema,
  composioManagedAuthSchemes: optionalStringArraySchema,
  tool_count: z.number().optional().catch(undefined),
  toolCount: z.number().optional().catch(undefined),
  trigger_count: z.number().optional().catch(undefined),
  triggerCount: z.number().optional().catch(undefined),
});

const categoryEntrySchema = z.union([
  z.string(),
  z.object({ name: z.string() }).transform(entry => entry.name),
]);

// A paged toolkits response: { items, next_cursor } envelope or a bare array.
const toolkitsPageSchema = z.union([
  z.object({
    items: z.array(z.unknown()),
    next_cursor: z.string().optional().catch(undefined),
  }),
  z.array(z.unknown()).transform(items => ({ items, next_cursor: undefined })),
]);

const slugItemSchema = z.object({ slug: z.string() });

// Tools/triggers list entries share the slug/name/description shape.
const rawNamedItemSchema = z.object({
  slug: z.string().catch(''),
  name: z.string().optional().catch(undefined),
  display_name: z.string().optional().catch(undefined),
  description: z.string().catch(''),
});

const namedItemListSchema = z
  .union([
    z.object({ items: z.array(z.unknown()) }).transform(data => data.items),
    z.array(z.unknown()),
  ])
  .catch([])
  .transform(items =>
    items.flatMap(item => {
      const parsed = rawNamedItemSchema.safeParse(item);
      if (!parsed.success) return [];
      const { slug, name, display_name, description } = parsed.data;
      return [{ slug, name: name || display_name || slug, description }];
    })
  );

const requirementListsSchema = z
  .object({
    required: z.array(z.unknown()).catch([]),
    optional: z.array(z.unknown()).catch([]),
  })
  .catch({ required: [], optional: [] });

const authConfigFieldsSchema = z
  .object({
    auth_config_creation: requirementListsSchema,
    connected_account_initiation: requirementListsSchema,
  })
  .catch({
    auth_config_creation: { required: [], optional: [] },
    connected_account_initiation: { required: [], optional: [] },
  });

const rawAuthConfigFieldSchema = z.object({
  name: z.string().catch(''),
  displayName: z.string().optional().catch(undefined),
  type: z.string().catch('string'),
  description: z.string().catch(''),
  required: z.boolean().optional().catch(undefined),
  default: z
    .union([z.string(), z.number(), z.boolean()])
    .transform(value => String(value))
    .nullable()
    .optional()
    .catch(undefined),
});

const rawAuthConfigDetailSchema = z.object({
  mode: z.string().catch(''),
  name: z.string().optional().catch(undefined),
});

const authConfigDetailsResponseSchema = z
  .object({ auth_config_details: z.array(z.unknown()).catch([]) })
  .catch({ auth_config_details: [] });

// The backend silently caps `limit` at 1000 per page and defaults to usage
// ordering, so a single request returns only the top-1000 toolkits — about half
// the catalog. Request the cap and follow `next_cursor` until exhausted.
// MAX_PAGES is a runaway guard well above the real catalog (~2.1k → 3 pages).
const TOOLKITS_PAGE_LIMIT = 1000;
const TOOLKITS_MAX_PAGES = 12;

export function parseToolkitsPage(value: unknown) {
  return toolkitsPageSchema.parse(value);
}

export function parseNamedItems(value: unknown) {
  return namedItemListSchema.parse(value);
}

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

    const pageData = parseToolkitsPage(await response.json());
    for (const item of pageData.items) {
      const parsedSlug = slugItemSchema.safeParse(item);
      const slug = parsedSlug.success ? parsedSlug.data.slug.toLowerCase() : undefined;
      if (slug) {
        if (seen.has(slug)) continue;
        seen.add(slug);
      }
      items.push(item);
    }

    cursor = pageData.next_cursor;
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

  return parseNamedItems(await response.json());
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

  return parseNamedItems(await response.json());
}

export function transformAuthConfigField(value: unknown, required: boolean): AuthConfigField {
  const parsed = rawAuthConfigFieldSchema.safeParse(value);
  const field = parsed.success ? parsed.data : rawAuthConfigFieldSchema.parse({});

  return {
    name: field.name,
    displayName: field.displayName || field.name,
    type: field.type,
    description: field.description,
    required: field.required ?? required,
    default: field.default ?? null,
  };
}

export function authConfigFields(
  raw: Record<string, unknown>,
  phase: 'auth_config_creation' | 'connected_account_initiation',
  requirement: 'required' | 'optional'
): AuthConfigField[] {
  const fields = authConfigFieldsSchema.parse(raw.fields);
  return fields[phase][requirement].map(field =>
    transformAuthConfigField(field, requirement === 'required')
  );
}

export function transformAuthConfigDetail(value: unknown): AuthConfigDetail | null {
  const raw = z.record(z.string(), z.unknown()).safeParse(value);
  if (!raw.success) return null;

  const { mode, name } = rawAuthConfigDetailSchema.parse(raw.data);
  return {
    mode,
    name: name || mode,
    fields: {
      auth_config_creation: {
        required: authConfigFields(raw.data, 'auth_config_creation', 'required'),
        optional: authConfigFields(raw.data, 'auth_config_creation', 'optional'),
      },
      connected_account_initiation: {
        required: authConfigFields(raw.data, 'connected_account_initiation', 'required'),
        optional: authConfigFields(raw.data, 'connected_account_initiation', 'optional'),
      },
    },
  };
}

async function fetchAuthConfigDetails(slug: string): Promise<AuthConfigDetail[]> {
  const response = await fetchWithRetry(`${API_BASE}/toolkits/${slug}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) return [];

  const data = authConfigDetailsResponseSchema.parse(await response.json());

  return data.auth_config_details.flatMap(item => {
    const detail = transformAuthConfigDetail(item);
    return detail ? [detail] : [];
  });
}

export function transformToolkit(raw: unknown): Toolkit {
  const parsed = rawToolkitSchema.safeParse(raw);
  const toolkit = parsed.success ? parsed.data : rawToolkitSchema.parse({});
  const slug = toolkit.slug.toLowerCase();
  const firstCategory = categoryEntrySchema.safeParse(toolkit.meta.categories[0]);
  const category = firstCategory.success ? firstCategory.data : null;
  const authSchemes = toolkit.auth_schemes ?? toolkit.authSchemes ?? [];
  const composioManaged =
    toolkit.composio_managed_auth_schemes ?? toolkit.composioManagedAuthSchemes ?? [];

  return {
    slug,
    name: toolkit.name || toolkit.slug,
    logo: toolkit.meta.logo || toolkit.logo || null,
    description: toolkit.meta.description || toolkit.description,
    category: category || null,
    authSchemes,
    ...(composioManaged.length > 0 ? { composioManagedAuthSchemes: composioManaged } : {}),
    toolCount: toolkit.tool_count || toolkit.toolCount || 0,
    triggerCount: toolkit.trigger_count || toolkit.triggerCount || 0,
    version: null,
    tools: [],
    triggers: [],
  };
}

export function shouldPublishToolkit(raw: unknown): boolean {
  return !EXCLUDED_PUBLIC_TOOLKIT_SLUGS.has(transformToolkit(raw).slug);
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
  const toolkits: Toolkit[] = rawToolkits.filter(shouldPublishToolkit).map(transformToolkit);

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

if (import.meta.main) {
  if (!API_KEY) {
    console.error('Error: COMPOSIO_API_KEY environment variable is required');
    process.exit(1);
  }

  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
