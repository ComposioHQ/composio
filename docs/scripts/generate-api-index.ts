/**
 * Generates simple markdown index pages for each OpenAPI tag.
 * These pages provide:
 * - Tag description from OpenAPI spec
 * - Links to all endpoints in that tag
 *
 * Run: bun scripts/generate-api-index.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface OpenAPISpec {
  tags: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, { summary?: string; tags?: string[]; description?: string; operationId?: string }>>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateIndexPages() {
  // Read OpenAPI spec
  const specPath = join(process.cwd(), 'public/openapi.json');
  const spec: OpenAPISpec = JSON.parse(readFileSync(specPath, 'utf-8'));

  // Build tag -> operations map
  const tagOperations: Record<string, Array<{ summary: string; description?: string; method: string; path: string; operationId: string }>> = {};
  const tagDescriptions: Record<string, string> = {};

  // Get tag descriptions
  for (const tag of spec.tags) {
    tagDescriptions[tag.name] = tag.description || '';
    tagOperations[tag.name] = [];
  }

  // For endpoints that exist under multiple API versions (e.g. /api/v3/ and /api/v3.1/),
  // only show the latest version. Extract version from path like /api/v3.1/tools/... → "3.1"
  const supersededPaths: Set<string> = new Set();
  const versionedPaths = new Map<string, { version: string; fullPath: string }[]>();

  for (const path of Object.keys(spec.paths)) {
    const match = path.match(/^\/api\/v([\d.]+)\/(.+)$/);
    if (!match) continue;
    const [, version, rest] = match;
    if (!versionedPaths.has(rest)) versionedPaths.set(rest, []);
    versionedPaths.get(rest)!.push({ version, fullPath: path });
  }

  for (const entries of versionedPaths.values()) {
    if (entries.length <= 1) continue;
    // Sort by version descending; keep only the latest
    entries.sort((a, b) => parseFloat(b.version) - parseFloat(a.version));
    for (const entry of entries.slice(1)) {
      supersededPaths.add(entry.fullPath);
    }
  }

  // Group operations by tag
  for (const [path, methods] of Object.entries(spec.paths)) {
    // Skip endpoints superseded by a newer API version
    if (supersededPaths.has(path)) continue;
    for (const [method, operation] of Object.entries(methods)) {
      if (operation.tags) {
        for (const tag of operation.tags) {
          if (!tagOperations[tag]) {
            tagOperations[tag] = [];
          }
          const summaryFallback = operation.summary || `${method.toUpperCase()} ${path}`;
          tagOperations[tag].push({
            summary: summaryFallback,
            description: operation.description,
            method: method.toUpperCase(),
            path,
            operationId: operation.operationId || slugify(summaryFallback),
          });
        }
      }
    }
  }

  // Generate MDX files for each tag as index.mdx inside folders
  const outputDir = join(process.cwd(), 'content/reference/api-reference');

  for (const [tagName, operations] of Object.entries(tagOperations)) {
    if (operations.length === 0) continue;

    const tagSlug = slugify(tagName);
    const tagDescription = tagDescriptions[tagName] || `${tagName} API endpoints`;

    // Generate endpoint table
    const tableRows = operations.map(op => {
      const url = `/reference/api-reference/${tagSlug}/${op.operationId}`;

      return `| \`${op.method} ${op.path}\` | [${op.summary}](${url}) |`;
    }).join('\n');

    const content = `---
title: ${tagName}
description: "${tagDescription}"
---

{/* Auto-generated from OpenAPI spec. Do not edit directly. */}

${tagDescription}

## Endpoints

| Endpoint | Quick Link |
|----------|------------|
${tableRows}
`;

    // Create folder and write index.mdx inside
    const folderPath = join(outputDir, tagSlug);
    mkdirSync(folderPath, { recursive: true });
    const filePath = join(folderPath, 'index.mdx');
    writeFileSync(filePath, content);
    console.log(`Generated: ${tagSlug}/index.mdx`);
  }

  console.log('Done generating API index pages');
}

generateIndexPages();
