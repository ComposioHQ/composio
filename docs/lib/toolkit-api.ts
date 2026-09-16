import { z } from 'zod';
import { isPublicToolkitSlug, normalizeToolkitSlug } from '@/lib/public-toolkit-policy';
import { PRODUCTION_API_V3_URL } from '@/scripts/production-api.mjs';
import type { AuthConfigDetail, AuthConfigField, Toolkit } from '@/types/toolkit';

const NEGATIVE_CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_MAX_ENTRIES = 1_024;
const IN_FLIGHT_LOOKUP_MAX_ENTRIES = 1_024;
const PRODUCTION_REQUEST_TIMEOUT_MS = 15_000;
// Production includes public toolkit slugs such as `_1password`.
const TOOLKIT_SLUG_PATTERN = /^[a-z0-9_][a-z0-9_-]{0,63}$/;

const negativeCache = new Map<string, number>();
const inFlightLookups = new Map<string, Promise<Toolkit | null>>();

function filteredArray<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .catch([])
    .transform(items =>
      items.flatMap(item => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    );
}

const optionalString = z.string().optional().catch(undefined);
const stringArray = filteredArray(z.string());

const rawAuthConfigFieldSchema = z.object({
  name: z.string().catch(''),
  displayName: optionalString,
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

const rawAuthConfigDetailSchema = z.object({
  mode: z.string().min(1),
  name: optionalString,
  fields: authConfigFieldsSchema,
});

const categorySchema = z.union([
  z.string(),
  z.object({ name: z.string() }).transform(category => category.name),
]);

const rawToolkitSchema = z
  .object({
    slug: z.string().catch(''),
    name: optionalString,
    type: z.enum(['native', 'custom']).optional().catch(undefined),
    enabled: z.boolean().optional().catch(undefined),
    composio_managed_auth_schemes: stringArray,
    auth_config_details: filteredArray(rawAuthConfigDetailSchema),
    meta: z
      .object({
        description: z.string().catch(''),
        logo: optionalString,
        categories: z.array(z.unknown()).catch([]),
        tools_count: z.number().catch(0),
        triggers_count: z.number().catch(0),
        version: z.string().nullable().optional().catch(undefined),
      })
      .catch({
        description: '',
        logo: undefined,
        categories: [],
        tools_count: 0,
        triggers_count: 0,
        version: undefined,
      }),
  })
  .catch({
    slug: '',
    name: undefined,
    type: undefined,
    enabled: undefined,
    composio_managed_auth_schemes: [],
    auth_config_details: [],
    meta: {
      description: '',
      logo: undefined,
      categories: [],
      tools_count: 0,
      triggers_count: 0,
      version: undefined,
    },
  });

type RawAuthConfigField = z.infer<typeof rawAuthConfigFieldSchema>;
type RawAuthConfigDetail = z.infer<typeof rawAuthConfigDetailSchema>;
type RawToolkit = z.infer<typeof rawToolkitSchema>;

function normalizeAuthMode(mode: string): string {
  return mode.toUpperCase();
}

function uniqueAuthModes(modes: string[]): string[] {
  const seen = new Set<string>();
  return modes.flatMap(mode => {
    const normalized = normalizeAuthMode(mode);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function transformAuthConfigField(field: RawAuthConfigField, required: boolean): AuthConfigField {
  return {
    name: field.name,
    displayName: field.displayName || field.name,
    type: field.type,
    description: field.description,
    required: field.required ?? required,
    default: field.default ?? null,
  };
}

function authConfigFieldFromUnknown(value: unknown, required: boolean): AuthConfigField {
  const parsed = rawAuthConfigFieldSchema.safeParse(value);
  const field = parsed.success ? parsed.data : rawAuthConfigFieldSchema.parse({});
  return transformAuthConfigField(field, required);
}

function transformAuthConfigDetail(detail: RawAuthConfigDetail): AuthConfigDetail {
  const fields = detail.fields;
  return {
    mode: normalizeAuthMode(detail.mode),
    name: detail.name || detail.mode,
    fields: {
      auth_config_creation: {
        required: fields.auth_config_creation.required.map(field =>
          authConfigFieldFromUnknown(field, true)
        ),
        optional: fields.auth_config_creation.optional.map(field =>
          authConfigFieldFromUnknown(field, false)
        ),
      },
      connected_account_initiation: {
        required: fields.connected_account_initiation.required.map(field =>
          authConfigFieldFromUnknown(field, true)
        ),
        optional: fields.connected_account_initiation.optional.map(field =>
          authConfigFieldFromUnknown(field, false)
        ),
      },
    },
  };
}

function toolkitFromRaw(raw: RawToolkit, slug: string): Toolkit {
  const category = categorySchema.safeParse(raw.meta.categories[0]);
  const authConfigDetails = raw.auth_config_details.map(transformAuthConfigDetail);
  const composioManagedAuthSchemes = uniqueAuthModes(raw.composio_managed_auth_schemes);
  const authSchemes = uniqueAuthModes([
    ...authConfigDetails.map(detail => detail.mode),
    ...composioManagedAuthSchemes,
  ]);

  return {
    slug,
    name: raw.name || raw.slug || slug,
    logo: raw.meta.logo || null,
    description: raw.meta.description,
    category: category.success && category.data ? category.data : null,
    authSchemes,
    ...(composioManagedAuthSchemes.length > 0 ? { composioManagedAuthSchemes } : {}),
    toolCount: raw.meta.tools_count,
    triggerCount: raw.meta.triggers_count,
    version: raw.meta.version ?? null,
    tools: [],
    triggers: [],
    ...(authConfigDetails.length > 0 ? { authConfigDetails } : {}),
  };
}

function recordNegative(slug: string) {
  const now = Date.now();
  for (const [cachedSlug, expiresAt] of negativeCache) {
    if (expiresAt > now) break;
    negativeCache.delete(cachedSlug);
  }

  negativeCache.delete(slug);
  if (negativeCache.size >= NEGATIVE_CACHE_MAX_ENTRIES) {
    const oldestSlug = negativeCache.keys().next().value;
    if (oldestSlug !== undefined) negativeCache.delete(oldestSlug);
  }
  negativeCache.set(slug, now + NEGATIVE_CACHE_TTL_MS);
}

/** Fetch one toolkit's metadata from production after a checked-in snapshot miss. */
export async function fetchToolkitFromProduction(slug: string): Promise<Toolkit | null> {
  if (process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK === '0') return null;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.warn(`[Toolkits] Production toolkit lookup skipped for "${slug}": missing API key`);
    return null;
  }

  const normalizedSlug = normalizeToolkitSlug(slug);
  if (!TOOLKIT_SLUG_PATTERN.test(normalizedSlug)) return null;
  if (!isPublicToolkitSlug(normalizedSlug)) return null;

  const negativeUntil = negativeCache.get(normalizedSlug);
  if (negativeUntil !== undefined) {
    if (negativeUntil > Date.now()) return null;
    negativeCache.delete(normalizedSlug);
  }

  const inFlightLookup = inFlightLookups.get(normalizedSlug);
  if (inFlightLookup) return inFlightLookup;

  const request = fetchAndMapToolkit(normalizedSlug, apiKey);
  let trackedRequest: Promise<Toolkit | null>;
  trackedRequest = request.finally(() => {
    if (inFlightLookups.get(normalizedSlug) === trackedRequest) {
      inFlightLookups.delete(normalizedSlug);
    }
  });

  if (inFlightLookups.size >= IN_FLIGHT_LOOKUP_MAX_ENTRIES) {
    const oldestSlug = inFlightLookups.keys().next().value;
    if (oldestSlug !== undefined) inFlightLookups.delete(oldestSlug);
  }
  inFlightLookups.set(normalizedSlug, trackedRequest);

  return trackedRequest;
}

async function fetchAndMapToolkit(normalizedSlug: string, apiKey: string): Promise<Toolkit | null> {
  try {
    const response = await fetch(`${PRODUCTION_API_V3_URL}/toolkits/${normalizedSlug}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(PRODUCTION_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      recordNegative(normalizedSlug);
      console.warn(
        `[Toolkits] Production toolkit lookup failed for "${normalizedSlug}": ${response.status}`
      );
      return null;
    }

    const payload = rawToolkitSchema.parse(await response.json());
    if (payload.type !== 'native' || payload.enabled !== true) {
      recordNegative(normalizedSlug);
      console.warn(
        `[Toolkits] Production toolkit lookup rejected non-public toolkit "${normalizedSlug}"`
      );
      return null;
    }
    return toolkitFromRaw(payload, normalizedSlug);
  } catch (error) {
    recordNegative(normalizedSlug);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Toolkits] Production toolkit lookup failed for "${normalizedSlug}": ${message}`);
    return null;
  }
}
