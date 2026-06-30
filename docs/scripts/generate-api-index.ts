/**
 * Generates markdown index pages for each OpenAPI tag.
 * Reads both v3.1 and v3.0 specs and generates a table that
 * uses the ApiEndpointsTable component to switch versions dynamically.
 *
 * Run: bun scripts/generate-api-index.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { HIDDEN_API_TAGS } from '../lib/filter-api-version';

/**
 * API-reference tags hidden on our side even though the upstream OpenAPI spec
 * (from hermes) includes them. Matched by slug. We neither generate their
 * `index.mdx` overview pages nor leave stale ones behind. Shared with the
 * reference page-tree filter so both stay in sync.
 */
const HIDDEN_TAGS: ReadonlySet<string> = HIDDEN_API_TAGS;

/**
 * Display-title overrides for API-reference tags whose upstream OpenAPI tag
 * name is stale or off-brand. Keyed by tag slug.
 */
const TITLE_OVERRIDES: Record<string, string> = {
  'tool-router': 'Sessions (prev Tool Router)',
};

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

/**
 * Optional hand-written overview for a tag, merged above the generated
 * endpoints table. Lives in `api-overviews/<tagSlug>.mdx` (outside `content/`,
 * so Fumadocs never renders it as its own page). Use this to fold a conceptual
 * guide into the API reference page instead of keeping a separate docs page.
 * Frontmatter, if present, is stripped — the generator owns the frontmatter.
 */
function readOverview(tagSlug: string): string | null {
  const overviewPath = join(process.cwd(), 'api-overviews', `${tagSlug}.mdx`);
  if (!existsSync(overviewPath)) return null;
  const raw = readFileSync(overviewPath, 'utf-8');
  const stripped = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  return stripped.length > 0 ? stripped : null;
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

function activeTagSlugs(opsByTag: Record<string, OperationEntry[]>): Set<string> {
  const active = new Set<string>();
  for (const [tagName, ops] of Object.entries(opsByTag)) {
    const tagSlug = slugify(tagName);
    if (ops.length > 0 && !HIDDEN_TAGS.has(tagSlug)) {
      active.add(tagSlug);
    }
  }
  return active;
}

function removeStaleTagIndexes(baseDir: string, activeSlugs: Set<string>) {
  if (!existsSync(baseDir)) return;

  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const tagSlug = entry.name;
    if (activeSlugs.has(tagSlug)) continue;

    const tagDir = join(baseDir, tagSlug);
    const indexPath = join(tagDir, 'index.mdx');
    if (existsSync(indexPath)) {
      rmSync(tagDir, { recursive: true, force: true });
      console.log(`Removed stale tag: ${tagDir}`);
    }
  }
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

  removeStaleTagIndexes(outputDir, activeTagSlugs(v31Ops));
  removeStaleTagIndexes(
    join(process.cwd(), 'content/reference/v3/api-reference'),
    activeTagSlugs(v3Ops),
  );

  // Get all unique tag names
  const allTags = new Set([...Object.keys(v31Ops), ...Object.keys(v3Ops)]);

  for (const tagName of allTags) {
    const ops31 = v31Ops[tagName] || [];
    const ops3 = v3Ops[tagName] || [];
    const tagSlug = slugify(tagName);

    // Intentionally-hidden tag — skip generation and delete any existing index.mdx
    // (v3.1 and v3.0) so neither overview page lingers in the sidebar.
    if (HIDDEN_TAGS.has(tagSlug)) {
      for (const baseDir of [
        join(process.cwd(), 'content/reference/api-reference'),
        join(process.cwd(), 'content/reference/v3/api-reference'),
      ]) {
        const hidden = join(baseDir, tagSlug, 'index.mdx');
        if (existsSync(hidden)) {
          rmSync(hidden);
          console.log(`Removed hidden tag: ${hidden}`);
        }
      }
      continue;
    }

    // Tag declared in spec.tags but no operations reference it — clean up any stale index.mdx from a prior run.
    if (ops31.length === 0 && ops3.length === 0) {
      for (const baseDir of [
        join(process.cwd(), 'content/reference/api-reference'),
        join(process.cwd(), 'content/reference/v3/api-reference'),
      ]) {
        const stale = join(baseDir, tagSlug, 'index.mdx');
        if (existsSync(stale)) {
          rmSync(stale);
          console.log(`Removed stale: ${stale}`);
        }
      }
      continue;
    }

    const tagDescription = tagDescriptions[tagName] || `${tagName} API endpoints`;
    // Display-title overrides for tags whose OpenAPI name is stale (e.g. the
    // tool router is now Sessions). Keyed by slug.
    const displayTitle = TITLE_OVERRIDES[tagSlug] ?? tagName;
    const overview = readOverview(tagSlug);
    // Body above the endpoints table: hand-written overview when present,
    // otherwise the thin OpenAPI tag description.
    const body = overview ?? tagDescription;
    const genComment = overview
      ? `{/* Auto-generated from OpenAPI spec. Edit the overview at api-overviews/${tagSlug}.mdx, not this file. */}`
      : '{/* Auto-generated from OpenAPI spec. Do not edit directly. */}';

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
title: ${displayTitle}
description: "${tagDescription}"
---

${genComment}

${body}

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
title: ${displayTitle}
description: "${tagDescription}"
---

${genComment}

${body}

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
