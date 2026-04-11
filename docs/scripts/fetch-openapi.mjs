/**
 * Fetches and filters the OpenAPI specs for fumadocs.
 * Outputs two separate spec files:
 *   - public/openapi.json     (v3.1 — latest, clean operationIds)
 *   - public/openapi-v3.json  (v3.0)
 *
 * Run: bun run scripts/fetch-openapi.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OPENAPI_V3_URL = process.env.OPENAPI_SPEC_URL || 'https://backend.composio.dev/api/v3/openapi.json';
const OPENAPI_V31_URL = process.env.OPENAPI_V31_SPEC_URL || 'https://backend.composio.dev/api/v3.1/openapi.json';

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

fetchAndFilterSpec().catch(console.error);
