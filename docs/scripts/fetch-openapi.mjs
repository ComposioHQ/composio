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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fetchWithRetry } from './fetch-with-retry';
import { declareOperationTags } from '../lib/openapi-tags';
import {
  PRODUCTION_BASE_URL,
  PRODUCTION_API_V3_URL,
  PRODUCTION_API_V31_URL,
} from './production-api.mjs';

const OPENAPI_V3_URL = process.env.OPENAPI_SPEC_URL || `${PRODUCTION_API_V3_URL}/openapi.json`;
const OPENAPI_V31_URL =
  process.env.OPENAPI_V31_SPEC_URL || `${PRODUCTION_API_V31_URL}/openapi.json`;
const OPENAPI_WEBHOOKS_URL =
  process.env.OPENAPI_WEBHOOKS_SPEC_URL || `${PRODUCTION_API_V31_URL}/openapi-webhooks.json`;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// Tags to ignore (internal/admin)
const IGNORED_TAGS = new Set(['CLI', 'Admin', 'Profiling', 'User', 'x-internal']);

const NonEmptyStringSchema = z.string().trim().min(1);
const JsonObjectSchema = z.object({}).passthrough();
const TagSchema = z
  .object({
    name: NonEmptyStringSchema,
    description: z.string().optional(),
  })
  .passthrough();
const OperationSchema = z
  .object({
    tags: z.array(NonEmptyStringSchema).optional(),
    operationId: NonEmptyStringSchema.optional(),
    security: z.array(z.record(z.string(), z.unknown())).optional(),
    'x-internal': z.boolean().optional(),
  })
  .passthrough();
const PathItemSchema = z
  .object({
    get: OperationSchema.optional(),
    put: OperationSchema.optional(),
    post: OperationSchema.optional(),
    delete: OperationSchema.optional(),
    options: OperationSchema.optional(),
    head: OperationSchema.optional(),
    patch: OperationSchema.optional(),
    trace: OperationSchema.optional(),
  })
  .passthrough();
const OpenApiDocumentSchema = z
  .object({
    openapi: NonEmptyStringSchema,
    paths: z.record(z.string(), PathItemSchema),
    tags: z.array(TagSchema).optional(),
    components: z
      .object({
        securitySchemes: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const JsonRequestBodySchema = z
  .object({
    content: z
      .object({
        'application/json': z
          .object({
            schema: JsonObjectSchema,
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
const WebhookOperationSchema = OperationSchema.extend({
  operationId: NonEmptyStringSchema,
  tags: z.array(NonEmptyStringSchema).min(1),
  requestBody: JsonRequestBodySchema,
});
const WebhookItemSchema = z
  .object({
    post: WebhookOperationSchema,
  })
  .passthrough();
const WebhookDocumentSchema = z
  .object({
    openapi: z.string().refine(version => version.startsWith('3.1'), {
      error: 'Expected an OpenAPI 3.1 document',
    }),
    tags: z.array(TagSchema).min(1),
    webhooks: z
      .record(NonEmptyStringSchema, WebhookItemSchema)
      .refine(webhooks => Object.keys(webhooks).length > 0, {
        error: 'Expected at least one webhook event',
      }),
  })
  .passthrough()
  .superRefine((document, context) => {
    const declaredTags = new Set(document.tags.map(tag => tag.name));
    const operationIds = new Set();

    for (const [eventName, item] of Object.entries(document.webhooks)) {
      for (const tag of item.post.tags) {
        if (!declaredTags.has(tag)) {
          context.addIssue({
            code: 'custom',
            path: ['webhooks', eventName, 'post', 'tags'],
            message: `Tag "${tag}" is not declared in document.tags`,
          });
        }
      }

      if (operationIds.has(item.post.operationId)) {
        context.addIssue({
          code: 'custom',
          path: ['webhooks', eventName, 'post', 'operationId'],
          message: `Duplicate operationId "${item.post.operationId}"`,
        });
      }
      operationIds.add(item.post.operationId);
    }
  });

async function fetchJson(url) {
  console.log(`Fetching OpenAPI spec from ${url}...`);
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

function formatZodError(error) {
  return error.issues
    .map(issue => `${issue.path.join('.') || 'document'}: ${issue.message}`)
    .join('; ');
}

function parseDocument(schema, payload, label) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid ${label}: ${formatZodError(parsed.error)}`);
  }

  // Zod confirms the boundary; the clone preserves the upstream document's key
  // order instead of serializing Zod's schema-key order into generated files.
  return structuredClone(payload);
}

function forEachOperation(paths, callback) {
  for (const pathItem of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) callback(operation);
    }
  }
}

/**
 * Filter paths: remove ignored/internal tags, keep the first public tag only.
 */
function filterPaths(paths) {
  const filteredPaths = {};
  let removedCount = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    const filteredPathItem = { ...pathItem };

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tags = operation.tags ?? [];
      const isInternal = operation['x-internal'] === true || tags.includes('x-internal');
      const publicTags = tags.filter(tag => !IGNORED_TAGS.has(tag));
      const hasOnlyIgnoredTags = tags.length > 0 && publicTags.length === 0;

      if (isInternal || hasOnlyIgnoredTags) {
        delete filteredPathItem[method];
        removedCount++;
      } else if (publicTags.length > 0) {
        filteredPathItem[method] = { ...operation, tags: [publicTags[0]] };
      }
    }

    const hasOperation = HTTP_METHODS.some(method => filteredPathItem[method]);
    if (hasOperation || filteredPathItem.$ref) {
      filteredPaths[path] = filteredPathItem;
    }
  }

  return { filteredPaths, removedCount };
}

/**
 * Strip version prefixes from operationIds (e.g. getV3_1Tools → getTools).
 */
function cleanOperationIds(paths) {
  forEachOperation(paths, operation => {
    if (operation.operationId) {
      operation.operationId = operation.operationId.replace(/V\d+_\d+/g, '');
    }
  });
}

function mergePropertySchemas(existing, incoming) {
  if (!existing) return structuredClone(incoming);

  const merged = structuredClone(existing);
  if (existing.enum && incoming.enum) {
    merged.enum = [...new Set([...existing.enum, ...incoming.enum])];
  }
  if (existing.properties && incoming.properties) {
    merged.properties = { ...existing.properties };
    for (const [key, value] of Object.entries(incoming.properties)) {
      merged.properties[key] = mergePropertySchemas(merged.properties[key], value);
    }
  }
  return merged;
}

function visitObjects(value, visitor, parentKey = '') {
  if (Array.isArray(value)) {
    for (const item of value) visitObjects(item, visitor, parentKey);
    return;
  }
  if (!value || typeof value !== 'object') return;

  visitor(value, parentKey);
  for (const [key, child] of Object.entries(value)) {
    visitObjects(child, visitor, key);
  }
}

function normalizeLargeObjectUnions(spec) {
  visitObjects(spec, schema => {
    for (const unionKey of ['anyOf', 'oneOf']) {
      const variants = schema[unionKey];
      if (!Array.isArray(variants) || variants.length <= 5) continue;

      const objectSchemas = variants.filter(
        variant => variant?.type === 'object' && variant.properties
      );
      const mostlyObjects =
        objectSchemas.length > 5 && objectSchemas.length >= variants.length * 0.8;
      if (!mostlyObjects) continue;

      const mergedProperties = {};
      for (const objectSchema of objectSchemas) {
        for (const [name, property] of Object.entries(objectSchema.properties)) {
          mergedProperties[name] = mergePropertySchemas(mergedProperties[name], property);
        }
      }

      const universallyRequired = [
        ...new Set(objectSchemas.flatMap(objectSchema => objectSchema.required ?? [])),
      ].filter(name => objectSchemas.every(objectSchema => objectSchema.required?.includes(name)));

      delete schema[unionKey];
      schema.type = 'object';
      schema.properties = mergedProperties;
      schema.additionalProperties = true;
      if (universallyRequired.length > 0) {
        schema.required = universallyRequired;
      }
    }
  });
}

function fixNullableWithoutType(spec) {
  visitObjects(spec, (schema, parentKey) => {
    const needsType =
      schema.nullable === true &&
      !schema.type &&
      !schema.$ref &&
      !schema.oneOf &&
      !schema.anyOf &&
      !schema.allOf;
    if (needsType) {
      if (parentKey === 'additionalProperties') {
        delete schema.nullable;
      } else if (Array.isArray(schema.example)) {
        schema.type = 'array';
      } else {
        schema.type = 'object';
      }
    }
  });
}

function removeCookieAuthentication(spec) {
  if (spec.components?.securitySchemes?.CookieAuth) {
    delete spec.components.securitySchemes.CookieAuth;
  }

  forEachOperation(spec.paths, operation => {
    if (!operation.security) return;

    operation.security = operation.security.filter(requirement => !('CookieAuth' in requirement));
    if (operation.security.length === 0) delete operation.security;
  });
}

/**
 * Post-process a spec: pin production, hide internal API, and normalize schemas.
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
  if (spec.tags) {
    spec.tags = spec.tags.filter(tag => !IGNORED_TAGS.has(tag.name));
  }
  // fumadocs-openapi only generates pages for operations whose tags are
  // declared top-level; the backend generator omits some (e.g. Projects).
  const declaredUpstream = new Set((spec.tags ?? []).map(tag => tag.name));
  declareOperationTags(spec);
  const addedTags = (spec.tags ?? []).filter(tag => !declaredUpstream.has(tag.name));
  if (addedTags.length > 0) {
    console.warn(
      `WARN: upstream spec uses tags missing from its top-level tags array: ${addedTags
        .map(tag => tag.name)
        .join(', ')}. Declared them automatically; the backend generator should emit them.`
    );
  }

  removeCookieAuthentication(spec);
  normalizeLargeObjectUnions(spec);
  fixNullableWithoutType(spec);
}

export function prepareApiSpec(payload, apiVersion) {
  const spec = parseDocument(
    OpenApiDocumentSchema,
    payload,
    `Composio API v${apiVersion} OpenAPI document`
  );
  const { filteredPaths, removedCount } = filterPaths(spec.paths);
  spec.paths = filteredPaths;

  cleanOperationIds(spec.paths);
  forEachOperation(spec.paths, operation => {
    operation['x-api-version'] = apiVersion;
  });
  postProcessSpec(spec);

  return { spec, removedCount };
}

function writeJson(filename, value) {
  const outputPath = join(SCRIPT_DIRECTORY, '../public', filename);
  writeFileSync(outputPath, JSON.stringify(value, null, 2));
  console.log(`Written ${filename} to ${outputPath}`);
}

async function fetchAndFilterSpecs() {
  const [v3Payload, v31Payload] = await Promise.all([
    fetchJson(OPENAPI_V3_URL),
    fetchJson(OPENAPI_V31_URL),
  ]);
  const v31 = prepareApiSpec(v31Payload, '3.1');
  const v3 = prepareApiSpec(v3Payload, '3.0');

  console.log(
    `v3.1: ${Object.keys(v31.spec.paths).length} paths (${v31.removedCount} operations removed)`
  );
  console.log(
    `v3.0: ${Object.keys(v3.spec.paths).length} paths (${v3.removedCount} operations removed)`
  );

  writeJson('openapi.json', v31.spec);
  writeJson('openapi-v3.json', v3.spec);
}

/**
 * Fetch the standalone webhook-events spec and write it verbatim.
 *
 * It's a separate OpenAPI 3.1 document keyed on `webhooks` (not `paths`), so it
 * skips the path filtering, server pinning, and union normalization above — none
 * of which apply. Fetched live from production like openapi.json.
 *
 * A fetch or schema failure leaves the committed snapshot untouched. This keeps
 * a transient or malformed production response from deleting generated pages.
 */
export function writeWebhookSnapshot(payload, outputPath, sourceUrl = OPENAPI_WEBHOOKS_URL) {
  const parsed = WebhookDocumentSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn(
      `WARN: refusing to write webhooks spec from ${sourceUrl} — ${formatZodError(parsed.error)}. Keeping existing ${outputPath}.`
    );
    return false;
  }

  const eventCount = Object.keys(parsed.data.webhooks).length;
  writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`Written webhooks spec to ${outputPath} (${eventCount} events)`);
  return true;
}

async function fetchAndWriteWebhookSpec() {
  const outputPath = join(SCRIPT_DIRECTORY, '../public/openapi-webhooks.json');
  try {
    const payload = await fetchJson(OPENAPI_WEBHOOKS_URL);
    writeWebhookSnapshot(payload, outputPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `WARN: could not fetch webhooks spec from ${OPENAPI_WEBHOOKS_URL}: ${message}. Keeping existing ${outputPath}.`
    );
  }
}

if (import.meta.main) {
  // Independent fetches with independent error handling; run them concurrently.
  await Promise.all([fetchAndFilterSpecs().catch(console.error), fetchAndWriteWebhookSpec()]);
}
