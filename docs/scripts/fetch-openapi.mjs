/**
 * Fetches and filters the OpenAPI spec for fumadocs
 * Mirrors the filtering done in fern/apis/openapi-overrides.yml
 *
 * Run: bun run scripts/fetch-openapi.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OPENAPI_URL = process.env.OPENAPI_SPEC_URL || 'https://backend.composio.dev/api/v3/openapi.json';

// Tags to ignore (internal/admin)
const IGNORED_TAGS = [
  'CLI',
  'Admin',
  'Profiling',
  'User',
  'x-internal',
];

async function fetchAndFilterSpec() {
  console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);

  const response = await fetch(OPENAPI_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const spec = await response.json();

  // Filter paths
  const filteredPaths = {};
  let removedCount = 0;

  for (const [path, methods] of Object.entries(spec.paths)) {
    const filteredMethods = {};

    for (const [method, operation] of Object.entries(methods)) {
      // Skip if all tags are ignored
      const tags = operation.tags || [];
      const hasValidTag = tags.some(tag => !IGNORED_TAGS.includes(tag));

      if (!hasValidTag && tags.length > 0) {
        removedCount++;
        continue;
      }

      // Skip if marked as internal (property or tag)
      if (operation['x-internal'] === true || tags.includes('x-internal')) {
        removedCount++;
        continue;
      }

      // Keep only the first tag to avoid duplicates in sidebar
      if (tags.length > 1) {
        operation.tags = [tags[0]];
      }

      filteredMethods[method] = operation;
    }

    if (Object.keys(filteredMethods).length > 0) {
      filteredPaths[path] = filteredMethods;
    }
  }

  spec.paths = filteredPaths;

  // Filter tags list
  if (spec.tags) {
    spec.tags = spec.tags.filter(tag => !IGNORED_TAGS.includes(tag.name));
  }

  // Remove CookieAuth from security schemes
  if (spec.components?.securitySchemes?.CookieAuth) {
    delete spec.components.securitySchemes.CookieAuth;
    console.log('Removed CookieAuth from securitySchemes');
  }

  // Remove CookieAuth from all endpoint security arrays
  let cookieAuthRemovedCount = 0;
  for (const methods of Object.values(spec.paths)) {
    for (const operation of Object.values(methods)) {
      if (operation.security) {
        const originalLength = operation.security.length;
        operation.security = operation.security.filter(sec => !('CookieAuth' in sec));
        if (operation.security.length < originalLength) {
          cookieAuthRemovedCount++;
        }
        // Remove empty security array
        if (operation.security.length === 0) {
          delete operation.security;
        }
      }
    }
  }
  console.log(`Removed CookieAuth from ${cookieAuthRemovedCount} endpoint security definitions`);

  console.log(`Removed ${removedCount} endpoints/operations`);
  console.log(`Final spec has ${Object.keys(filteredPaths).length} paths`);

  // Normalize overly complex anyOf/oneOf schemas (e.g., connection_data with 68 object variants)
  // Merges similar object schemas into a single object with all properties
  let unionNormalizedCount = 0;

  // Helper to merge two property schemas, combining enums if present
  const mergePropertySchemas = (existing, incoming) => {
    if (!existing) return JSON.parse(JSON.stringify(incoming));

    const merged = JSON.parse(JSON.stringify(existing));

    // Merge enum values if both have enums
    if (existing.enum && incoming.enum) {
      const enumSet = new Set([...existing.enum, ...incoming.enum]);
      merged.enum = [...enumSet];
    }

    // Recursively merge nested properties for objects
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

    // Check for anyOf or oneOf with many similar object schemas
    for (const unionKey of ['anyOf', 'oneOf']) {
      if (obj[unionKey] && Array.isArray(obj[unionKey]) && obj[unionKey].length > 5) {
        const objectSchemas = obj[unionKey].filter(
          (schema) => schema.type === 'object' && schema.properties
        );

        // If most variants are objects, merge them
        if (objectSchemas.length > 5 && objectSchemas.length >= obj[unionKey].length * 0.8) {
          const mergedProperties = {};
          const allRequired = new Set();

          // Collect all properties from all variants, merging enums
          for (const schema of objectSchemas) {
            for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
              mergedProperties[propName] = mergePropertySchemas(mergedProperties[propName], propSchema);
            }
            // Track required fields (only if required in ALL variants)
            if (schema.required) {
              for (const req of schema.required) {
                allRequired.add(req);
              }
            }
          }

          // Check which fields are required in ALL object schemas
          const universallyRequired = [];
          for (const req of allRequired) {
            const requiredInAll = objectSchemas.every(
              (schema) => schema.required && schema.required.includes(req)
            );
            if (requiredInAll) {
              universallyRequired.push(req);
            }
          }

          // Replace union with merged object schema
          delete obj[unionKey];
          obj.type = 'object';
          obj.properties = mergedProperties;
          if (universallyRequired.length > 0) {
            obj.required = universallyRequired;
          }
          obj.additionalProperties = true;

          unionNormalizedCount++;
          console.log(
            `  Merged ${unionKey} with ${objectSchemas.length} object variants into single object with ${Object.keys(mergedProperties).length} properties`
          );
        }
      }
    }

    // Recurse into all properties
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        val.forEach((item) => normalizeUnionSchemas(item));
      } else {
        normalizeUnionSchemas(val);
      }
    }
  };
  normalizeUnionSchemas(spec);
  if (unionNormalizedCount > 0) {
    console.log(`Normalized ${unionNormalizedCount} complex union schemas`);
  }

  // Fix invalid OpenAPI 3.0: "nullable: true" without "type" is invalid
  // See: https://swagger.io/docs/specification/data-models/data-types/#null
  let nullableFixCount = 0;
  const fixNullableWithoutType = (obj, parentKey = '') => {
    if (!obj || typeof obj !== 'object') return;

    // Check if this schema has nullable but no type definition
    if (obj.nullable === true && !obj.type && !obj.$ref && !obj.oneOf && !obj.anyOf && !obj.allOf) {
      // For additionalProperties, just remove nullable (allows any type)
      if (parentKey === 'additionalProperties') {
        delete obj.nullable;
      }
      // For schemas with an object example, infer type: object
      else if (obj.example && typeof obj.example === 'object' && !Array.isArray(obj.example)) {
        obj.type = 'object';
      }
      // For schemas with an array example, infer type: array
      else if (obj.example && Array.isArray(obj.example)) {
        obj.type = 'array';
      }
      // Default: add type: object (most common case for flexible schemas)
      else {
        obj.type = 'object';
      }
      nullableFixCount++;
    }

    // Recurse into all properties
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        val.forEach((item) => fixNullableWithoutType(item, key));
      } else {
        fixNullableWithoutType(val, key);
      }
    }
  };
  fixNullableWithoutType(spec);
  if (nullableFixCount > 0) {
    console.log(`Fixed ${nullableFixCount} schemas with nullable but no type`);
  }

  // Split spec into v3 and v3.1 versions for separate doc sections
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const v3Paths = {};
  const v31Paths = {};
  for (const [path, methods] of Object.entries(spec.paths)) {
    if (path.startsWith('/api/v3.1/')) {
      v31Paths[path] = methods;
    } else {
      v3Paths[path] = methods;
    }
  }

  // Collect tags used by each version
  const v3Tags = new Set();
  const v31Tags = new Set();
  for (const methods of Object.values(v3Paths)) {
    for (const op of Object.values(methods)) {
      for (const tag of (op.tags || [])) v3Tags.add(tag);
    }
  }
  for (const methods of Object.values(v31Paths)) {
    for (const op of Object.values(methods)) {
      for (const tag of (op.tags || [])) v31Tags.add(tag);
    }
  }

  const v3Spec = { ...spec, paths: v3Paths, tags: (spec.tags || []).filter(t => v3Tags.has(t.name)) };
  const v31Spec = { ...spec, paths: v31Paths, tags: (spec.tags || []).filter(t => v31Tags.has(t.name)) };

  // Write combined spec (for backwards compatibility) and versioned specs
  const outputPath = join(__dirname, '../public/openapi.json');
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  const v3OutputPath = join(__dirname, '../public/openapi-v3.json');
  writeFileSync(v3OutputPath, JSON.stringify(v3Spec, null, 2));
  console.log(`Written v3 spec to ${v3OutputPath} (${Object.keys(v3Paths).length} paths)`);

  const v31OutputPath = join(__dirname, '../public/openapi-v3.1.json');
  writeFileSync(v31OutputPath, JSON.stringify(v31Spec, null, 2));
  console.log(`Written v3.1 spec to ${v31OutputPath} (${Object.keys(v31Paths).length} paths)`);
}

fetchAndFilterSpec().catch(console.error);
