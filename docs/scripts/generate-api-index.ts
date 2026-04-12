/**
 * Generates markdown index pages for each OpenAPI tag.
 * Reads both v3.1 and v3.0 specs and generates a table that
 * uses the ApiEndpointsTable component to switch versions dynamically.
 *
 * Run: bun scripts/generate-api-index.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface OpenAPIOperation {
  summary?: string;
  tags?: string[];
  description?: string;
  operationId?: string;
  'x-api-version'?: string;
}

interface OpenAPISpec {
  tags: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
}

interface OperationEntry {
  summary: string;
  method: string;
  path: string;
  operationId: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getOperationsByTag(spec: OpenAPISpec): Record<string, OperationEntry[]> {
  const tagOps: Record<string, OperationEntry[]> = {};

  for (const tag of spec.tags) {
    tagOps[tag.name] = [];
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation.tags) {
        for (const tag of operation.tags) {
          if (!tagOps[tag]) tagOps[tag] = [];
          tagOps[tag].push({
            summary: operation.summary || `${method.toUpperCase()} ${path}`,
            method: method.toUpperCase(),
            path,
            operationId: operation.operationId || slugify(operation.summary || path),
          });
        }
      }
    }
  }

  return tagOps;
}

function generateIndexPages() {
  const specV31Path = join(process.cwd(), 'public/openapi.json');
  const specV3Path = join(process.cwd(), 'public/openapi-v3.json');

  const specV31: OpenAPISpec = JSON.parse(readFileSync(specV31Path, 'utf-8'));
  const v31Ops = getOperationsByTag(specV31);

  let v3Ops: Record<string, OperationEntry[]> = {};
  if (existsSync(specV3Path)) {
    const specV3: OpenAPISpec = JSON.parse(readFileSync(specV3Path, 'utf-8'));
    v3Ops = getOperationsByTag(specV3);
  }

  // Collect tag descriptions from v3.1 spec
  const tagDescriptions: Record<string, string> = {};
  for (const tag of specV31.tags) {
    tagDescriptions[tag.name] = tag.description || '';
  }

  const outputDir = join(process.cwd(), 'content/reference/api-reference');

  // Get all unique tag names
  const allTags = new Set([...Object.keys(v31Ops), ...Object.keys(v3Ops)]);

  for (const tagName of allTags) {
    const ops31 = v31Ops[tagName] || [];
    const ops3 = v3Ops[tagName] || [];
    if (ops31.length === 0 && ops3.length === 0) continue;

    const tagSlug = slugify(tagName);
    const tagDescription = tagDescriptions[tagName] || `${tagName} API endpoints`;

    // Only generate v3.1 index page if the tag has v3.1 operations
    if (ops31.length > 0) {
      const v3ByOpId: Record<string, OperationEntry> = {};
      for (const op of ops3) {
        v3ByOpId[op.operationId] = op;
      }

      const endpoints = ops31.map(op => {
        const v3Op = v3ByOpId[op.operationId];
        return {
          method: op.method,
          pathV31: op.path,
          pathV3: v3Op ? v3Op.path : op.path.replace('/v3.1/', '/v3/'),
          summary: op.summary,
          href: `/reference/api-reference/${tagSlug}/${op.operationId}`,
        };
      });

      const content = `---
title: ${tagName}
description: "${tagDescription}"
---

{/* Auto-generated from OpenAPI spec. Do not edit directly. */}

${tagDescription}

## Endpoints

<ApiEndpointsTable endpoints={${JSON.stringify(endpoints)}} />
`;

      const folderPath = join(outputDir, tagSlug);
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(join(folderPath, 'index.mdx'), content);
      console.log(`Generated: ${tagSlug}/index.mdx`);
    }

    // Also generate v3 index page with v3-specific hrefs
    if (ops3.length > 0) {
      const v3Endpoints = ops3.map(op => ({
        method: op.method,
        pathV31: op.path.replace('/v3/', '/v3.1/'),
        pathV3: op.path,
        summary: op.summary,
        href: `/reference/v3/api-reference/${tagSlug}/${op.operationId}`,
      }));

      const v3Content = `---
title: ${tagName}
description: "${tagDescription}"
---

{/* Auto-generated from OpenAPI spec. Do not edit directly. */}

${tagDescription}

## Endpoints

<ApiEndpointsTable endpoints={${JSON.stringify(v3Endpoints)}} />
`;

      const v3FolderPath = join(process.cwd(), 'content/reference/v3/api-reference', tagSlug);
      mkdirSync(v3FolderPath, { recursive: true });
      writeFileSync(join(v3FolderPath, 'index.mdx'), v3Content);
      console.log(`Generated: v3/api-reference/${tagSlug}/index.mdx`);
    }
  }

  console.log('Done generating API index pages');
}

generateIndexPages();
