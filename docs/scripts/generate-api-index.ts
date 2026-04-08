/**
 * Generates simple markdown index pages for each OpenAPI tag, split by API version.
 * Creates separate sections for v3 and v3.1 API endpoints.
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

function generateIndexPagesForSpec(specPath: string, version: string, baseOutputDir: string) {
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
  const outputDir = join(baseOutputDir, version);

  for (const [tagName, operations] of Object.entries(tagOperations)) {
    if (operations.length === 0) continue;

    const tagSlug = slugify(tagName);
    const tagDescription = tagDescriptions[tagName] || `${tagName} API endpoints`;

    // Generate endpoint table
    const tableRows = operations.map(op => {
      const url = `/reference/api-reference/${version}/${tagSlug}/${op.operationId}`;

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
    console.log(`Generated: ${version}/${tagSlug}/index.mdx`);
  }
}

function generateIndexPages() {
  const publicDir = join(process.cwd(), 'public');
  const outputDir = join(process.cwd(), 'content/reference/api-reference');

  // Generate for v3
  const v3SpecPath = join(publicDir, 'openapi-v3.json');
  generateIndexPagesForSpec(v3SpecPath, 'v3', outputDir);

  // Generate for v3.1
  const v31SpecPath = join(publicDir, 'openapi-v3.1.json');
  generateIndexPagesForSpec(v31SpecPath, 'v3.1', outputDir);

  console.log('Done generating API index pages');
}

generateIndexPages();
