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

// Endpoints to ignore (same as fern openapi-overrides.yml)
const IGNORED_PATHS = [
  '/api/v3/mcp/validate/{uuid}',
  '/api/v3/cli/get-session',
  '/api/v3/cli/create-session',
  '/api/v3/auth/session/logout',
];

// Tags to ignore (internal/admin)
const IGNORED_TAGS = [
  'CLI',
  'Admin',
  'Profiling',
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
    // Skip ignored paths
    if (IGNORED_PATHS.includes(path)) {
      removedCount++;
      continue;
    }

    const filteredMethods = {};

    for (const [method, operation] of Object.entries(methods)) {
      // Skip if all tags are ignored
      const tags = operation.tags || [];
      const hasValidTag = tags.some(tag => !IGNORED_TAGS.includes(tag));

      if (!hasValidTag && tags.length > 0) {
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

  console.log(`Removed ${removedCount} endpoints/operations`);
  console.log(`Final spec has ${Object.keys(filteredPaths).length} paths`);

  // Write to public directory for fumadocs to fetch
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outputPath = join(__dirname, '../public/openapi.json');
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`Written to ${outputPath}`);
}

fetchAndFilterSpec().catch(console.error);
