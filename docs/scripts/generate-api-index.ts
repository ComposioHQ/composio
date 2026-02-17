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

  // Group operations by tag
  for (const [path, methods] of Object.entries(spec.paths)) {
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
