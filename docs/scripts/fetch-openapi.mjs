/**
 * Fetches and filters the OpenAPI specs for fumadocs.
 *
 * Heads-up: "3.1" is overloaded below. The first two are OpenAPI 3.0.0
 * DOCUMENTS that happen to describe different COMPOSIO API versions; the third
 * is an OpenAPI 3.1.0 document (a format version, not an API version).
 *
 * Outputs three spec files:
 *   - public/openapi.json           Composio API v3.1, as an OpenAPI 3.0.0 doc
 *                                   (latest; operationIds cleaned)
 *   - public/openapi-v3.json        Composio API v3.0, as an OpenAPI 3.0.0 doc
 *   - public/openapi-webhooks.json  webhook event payloads, as an OpenAPI 3.1.0
 *                                   doc. The format bump is the whole reason
 *                                   this is a separate file: the top-level
 *                                   `webhooks` object does not exist in 3.0, so
 *                                   these cannot live in openapi.json.
 *
 * Run: bun run scripts/fetch-openapi.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PRODUCTION_BASE_URL, PRODUCTION_API_V3_URL, PRODUCTION_API_V31_URL } from './production-api.mjs';

const OPENAPI_V3_URL = process.env.OPENAPI_SPEC_URL || `${PRODUCTION_API_V3_URL}/openapi.json`;
const OPENAPI_V31_URL = process.env.OPENAPI_V31_SPEC_URL || `${PRODUCTION_API_V31_URL}/openapi.json`;
const OPENAPI_WEBHOOKS_URL = process.env.OPENAPI_WEBHOOKS_SPEC_URL || `${PRODUCTION_API_V31_URL}/openapi-webhooks.json`;

// Tags to ignore (internal/admin)
const IGNORED_TAGS = [
  'CLI',
  'Admin',
  'Profiling',
  'User',
  'x-internal',
];

async function fetchSpec(url) {
  console.log(`Fetching OpenAPI spec from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

/**
 * Filter paths: remove ignored/internal tags, keep first tag only.
 */
function filterPaths(paths) {
  const filteredPaths = {};
  let removedCount = 0;

  for (const [path, methods] of Object.entries(paths)) {
    const filteredMethods = {};

    for (const [method, operation] of Object.entries(methods)) {
      const tags = operation.tags || [];
      const hasValidTag = tags.some(tag => !IGNORED_TAGS.includes(tag));

      if (!hasValidTag && tags.length > 0) {
        removedCount++;
        continue;
      }

      if (operation['x-internal'] === true || tags.includes('x-internal')) {
        removedCount++;
        continue;
      }

      if (tags.length > 1) {
        operation.tags = [tags[0]];
      }

      filteredMethods[method] = operation;
    }

    if (Object.keys(filteredMethods).length > 0) {
      filteredPaths[path] = filteredMethods;
    }
  }

  return { filteredPaths, removedCount };
}

/**
 * Strip version prefixes from operationIds (e.g. getV3_1Tools → getTools).
 */
function cleanOperationIds(paths) {
  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods)) {
      if (operation.operationId) {
        // Remove V3_1, V3_0, etc. prefixes from operationId
        operation.operationId = operation.operationId.replace(/V\d+_\d+/g, '');
      }
    }
  }
}

/**
 * Post-process a spec: remove CookieAuth, normalize unions, fix nullable.
 */
function postProcessSpec(spec) {
  // Pin the server to production. The published docs must always show the
  // production base URL in their curl examples, regardless of which environment
  // the source spec was fetched from (a staging fetch would otherwise bake a
  // staging server URL into the committed reference).
  spec.servers = [
    {
      url: PRODUCTION_BASE_URL,
      description: 'PRODUCTION API',
    },
  ];

  // Filter tags list
  if (spec.tags) {
    spec.tags = spec.tags.filter(tag => !IGNORED_TAGS.includes(tag.name));
  }

  // Remove CookieAuth from security schemes
  if (spec.components?.securitySchemes?.CookieAuth) {
    delete spec.components.securitySchemes.CookieAuth;
  }

  // Remove CookieAuth from all endpoint security arrays
  for (const methods of Object.values(spec.paths)) {
    for (const operation of Object.values(methods)) {
      if (operation.security) {
        operation.security = operation.security.filter(sec => !('CookieAuth' in sec));
        if (operation.security.length === 0) {
          delete operation.security;
        }
      }
    }
  }

  // Normalize overly complex anyOf/oneOf schemas
  const mergePropertySchemas = (existing, incoming) => {
    if (!existing) return JSON.parse(JSON.stringify(incoming));
    const merged = JSON.parse(JSON.stringify(existing));
    if (existing.enum && incoming.enum) {
      merged.enum = [...new Set([...existing.enum, ...incoming.enum])];
    }
    if (existing.properties && incoming.properties) {
      merged.properties = { ...existing.properties };
      for (const [key, val] of Object.entries(incoming.properties)) {
        merged.properties[key] = mergePropertySchemas(merged.properties[key], val);
      }
    }
    return merged;
  };

  const normalizeUnionSchemas = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const unionKey of ['anyOf', 'oneOf']) {
      if (obj[unionKey] && Array.isArray(obj[unionKey]) && obj[unionKey].length > 5) {
        const objectSchemas = obj[unionKey].filter(s => s.type === 'object' && s.properties);
        if (objectSchemas.length > 5 && objectSchemas.length >= obj[unionKey].length * 0.8) {
          const mergedProperties = {};
          const allRequired = new Set();
          for (const schema of objectSchemas) {
            for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
              mergedProperties[propName] = mergePropertySchemas(mergedProperties[propName], propSchema);
            }
            if (schema.required) {
              for (const req of schema.required) allRequired.add(req);
            }
          }
          const universallyRequired = [...allRequired].filter(req =>
            objectSchemas.every(s => s.required && s.required.includes(req))
          );
          delete obj[unionKey];
          obj.type = 'object';
          obj.properties = mergedProperties;
          if (universallyRequired.length > 0) obj.required = universallyRequired;
          obj.additionalProperties = true;
        }
      }
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) val.forEach(item => normalizeUnionSchemas(item));
      else normalizeUnionSchemas(val);
    }
  };
  normalizeUnionSchemas(spec);

  // Fix invalid OpenAPI 3.0: "nullable: true" without "type"
  const fixNullableWithoutType = (obj, parentKey = '') => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.nullable === true && !obj.type && !obj.$ref && !obj.oneOf && !obj.anyOf && !obj.allOf) {
      if (parentKey === 'additionalProperties') {
        delete obj.nullable;
      } else if (obj.example && typeof obj.example === 'object' && !Array.isArray(obj.example)) {
        obj.type = 'object';
      } else if (obj.example && Array.isArray(obj.example)) {
        obj.type = 'array';
      } else {
        obj.type = 'object';
      }
    }
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) val.forEach(item => fixNullableWithoutType(item, key));
      else fixNullableWithoutType(val, key);
    }
  };
  fixNullableWithoutType(spec);
}

async function fetchAndFilterSpec() {
  // Fetch both specs in parallel
  const [v3Raw, v31Raw] = await Promise.all([
    fetchSpec(OPENAPI_V3_URL),
    fetchSpec(OPENAPI_V31_URL),
  ]);

  // --- v3.1 spec (latest, default) ---
  const v31Spec = JSON.parse(JSON.stringify(v31Raw));
  const v31Filtered = filterPaths(v31Spec.paths);
  v31Spec.paths = v31Filtered.filteredPaths;
  // Clean operationIds: getV3_1Tools → getTools (so URLs are clean)
  cleanOperationIds(v31Spec.paths);
  // Annotate all operations with version
  for (const methods of Object.values(v31Spec.paths)) {
    for (const op of Object.values(methods)) {
      op['x-api-version'] = '3.1';
    }
  }
  postProcessSpec(v31Spec);
  console.log(`v3.1: ${Object.keys(v31Spec.paths).length} paths`);

  // --- v3.0 spec ---
  const v3Spec = JSON.parse(JSON.stringify(v3Raw));
  const v3Filtered = filterPaths(v3Spec.paths);
  v3Spec.paths = v3Filtered.filteredPaths;
  cleanOperationIds(v3Spec.paths);
  for (const methods of Object.values(v3Spec.paths)) {
    for (const op of Object.values(methods)) {
      op['x-api-version'] = '3.0';
    }
  }
  postProcessSpec(v3Spec);
  console.log(`v3.0: ${Object.keys(v3Spec.paths).length} paths`);

  // Write both spec files
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const v31Path = join(__dirname, '../public/openapi.json');
  writeFileSync(v31Path, JSON.stringify(v31Spec, null, 2));
  console.log(`Written v3.1 spec to ${v31Path}`);

  const v3Path = join(__dirname, '../public/openapi-v3.json');
  writeFileSync(v3Path, JSON.stringify(v3Spec, null, 2));
  console.log(`Written v3.0 spec to ${v3Path}`);
}

/**
 * Fetch the standalone webhook-events spec and write it verbatim.
 *
 * It's a separate OpenAPI 3.1 document keyed on `webhooks` (not `paths`), so it
 * skips the path filtering, server pinning, and union normalization above — none
 * of which apply. Fetched live from production like openapi.json.
 *
 * Resilient by design: until Apollo's /api/v3.1/openapi-webhooks.json endpoint is
 * live in production, a fetch failure logs a warning and leaves the committed
 * public/openapi-webhooks.json untouched, rather than failing the whole sync.
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate the minimum webhook document shape consumed by Fumadocs and the API
 * index generator. A syntactically-valid OpenAPI document is not enough: an
 * incomplete deployment response could otherwise replace the last-good
 * snapshot and silently remove every generated webhook page.
 */
export function validateWebhooksSpec(spec) {
  const eventCount = isObject(spec?.webhooks) ? Object.keys(spec.webhooks).length : 0;

  if (!String(spec?.openapi ?? '').startsWith('3.1')) {
    return { valid: false, eventCount, reason: `expected OpenAPI 3.1, got ${spec?.openapi}` };
  }
  if (eventCount === 0) {
    return { valid: false, eventCount, reason: 'expected at least one webhook event' };
  }

  const declaredTags = new Set(
    Array.isArray(spec.tags)
      ? spec.tags
          .map(tag => tag?.name)
          .filter(name => typeof name === 'string' && name.trim().length > 0)
      : []
  );
  const operationIds = new Set();

  for (const [eventName, item] of Object.entries(spec.webhooks)) {
    const operation = isObject(item) && isObject(item.post) ? item.post : undefined;
    if (!operation) {
      return { valid: false, eventCount, reason: `${eventName} is missing a POST operation` };
    }

    const operationId = operation.operationId;
    if (typeof operationId !== 'string' || operationId.trim().length === 0) {
      return { valid: false, eventCount, reason: `${eventName} is missing operationId` };
    }
    if (operationIds.has(operationId)) {
      return { valid: false, eventCount, reason: `duplicate operationId ${operationId}` };
    }
    operationIds.add(operationId);

    const tags = Array.isArray(operation.tags)
      ? operation.tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0)
      : [];
    if (tags.length === 0 || tags.some(tag => !declaredTags.has(tag))) {
      return {
        valid: false,
        eventCount,
        reason: `${eventName} must reference a declared tag`,
      };
    }

    if (!isObject(operation.requestBody?.content?.['application/json']?.schema)) {
      return {
        valid: false,
        eventCount,
        reason: `${eventName} is missing an application/json request schema`,
      };
    }
  }

  return { valid: true, eventCount };
}

export function writeWebhooksSpecIfValid(spec, outPath, sourceUrl = OPENAPI_WEBHOOKS_URL) {
  const validation = validateWebhooksSpec(spec);
  if (!validation.valid) {
    console.warn(
      `WARN: refusing to write webhooks spec from ${sourceUrl} — ${validation.reason}. Keeping existing ${outPath}.`
    );
    return false;
  }

  writeFileSync(outPath, JSON.stringify(spec, null, 2));
  console.log(`Written webhooks spec to ${outPath} (${validation.eventCount} events)`);
  return true;
}

async function fetchAndWriteWebhooksSpec() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = join(__dirname, '../public/openapi-webhooks.json');
  try {
    const spec = await fetchSpec(OPENAPI_WEBHOOKS_URL);
    writeWebhooksSpecIfValid(spec, outPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `WARN: could not fetch webhooks spec from ${OPENAPI_WEBHOOKS_URL}: ${message}. Keeping existing ${outPath}.`
    );
  }
}

if (import.meta.main) {
  await fetchAndFilterSpec().catch(console.error);
  await fetchAndWriteWebhooksSpec();
}
