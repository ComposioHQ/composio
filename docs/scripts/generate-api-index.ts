/**
 * Generates markdown index pages for each OpenAPI tag.
 * Reads both v3.1 and v3.0 specs and generates a table that
 * uses the ApiEndpointsTable component to switch versions dynamically.
 *
 * Run: bun scripts/generate-api-index.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { HIDDEN_API_TAGS } from '../lib/filter-api-version';
import { apiEndpointsSchema } from '../lib/api-endpoints-table-schema';

/**
 * Serializes an endpoints array for the `<ApiEndpointsTable />` prop, refusing
 * to write a payload the readers cannot parse.
 *
 * At runtime `mdxToCleanMarkdown` degrades a malformed payload to an empty
 * table (one bad page must not 500 the whole `.md` response), so an invalid
 * payload written here would render as a silently empty Endpoints section —
 * exactly the defect this pipeline exists to avoid. A generator that cannot
 * produce a valid payload should fail the generation run instead.
 */
function serializeEndpoints(endpoints: unknown, label: string): string {
  const parsed = apiEndpointsSchema.safeParse(endpoints);
  if (!parsed.success) {
    throw new Error(
      `Invalid ApiEndpointsTable payload for ${label}:\n${z.prettifyError(parsed.error)}`
    );
  }
  return JSON.stringify(endpoints);
}

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
  deprecated?: boolean;
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
  deprecated: boolean;
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
            deprecated: operation.deprecated === true,
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

interface WebhookSpec {
  tags?: { name: string; description?: string }[];
  webhooks?: Record<string, Record<string, OpenAPIOperation>>;
}

function loadWebhookSpec(): WebhookSpec | null {
  const specPath = join(process.cwd(), 'public/openapi-webhooks.json');
  if (!existsSync(specPath)) return null;
  return JSON.parse(readFileSync(specPath, 'utf-8'));
}

/**
 * Tag slugs contributed by the separate webhook-events spec (PLEN-2793). Its
 * operations live under the OpenAPI 3.1 `webhooks` block (not `paths`) and its
 * tag ("Webhook Events") is absent from openapi.json — so without folding these
 * into the active set, `removeStaleTagIndexes` would recursively delete the
 * hand-authored `webhook-events` overview folder on the next docs data run.
 */
function webhookTagSlugs(spec: WebhookSpec | null): Set<string> {
  const slugs = new Set<string>();
  if (!spec) return slugs;

  for (const item of Object.values(spec.webhooks ?? {})) {
    for (const operation of Object.values(item)) {
      for (const tag of operation.tags ?? []) {
        slugs.add(slugify(tag));
      }
    }
  }
  return slugs;
}

/**
 * Generates the Webhook Events overview page from the webhooks spec.
 *
 * The event list MUST be derived, not hand-maintained: adding an event to the
 * Apollo registry would otherwise leave it off this page, and removing one would
 * leave a link to a page Fumadocs no longer builds (a 404). Prose lives in
 * `api-overviews/webhook-events.mdx`; everything below it is generated.
 *
 * Individual event pages are rendered by Fumadocs straight from the spec, so
 * this page only needs the index tables.
 */
function generateWebhookEventsIndex(spec: WebhookSpec | null, outputDir: string) {
  if (!spec) return;

  const entries = Object.entries(spec.webhooks ?? {});
  if (entries.length === 0) return;

  const operationTags = new Set(
    entries.flatMap(([, item]) => item.post?.tags ?? []),
  );
  if (operationTags.size !== 1) {
    throw new Error(
      `Expected webhook operations to share exactly one tag, found: ${[...operationTags].join(', ') || 'none'}`,
    );
  }

  const [operationTag] = operationTags;
  const tag = spec.tags?.find(candidate => candidate.name === operationTag);
  if (!tag) {
    throw new Error(`Webhook operation tag "${operationTag}" is not declared in spec.tags`);
  }
  const tagSlug = slugify(tag.name);

  const current: string[] = [];
  const legacy: string[] = [];

  for (const [key, item] of entries) {
    const operation = item.post;
    if (!operation?.operationId) continue;

    const href = `/reference/api-reference/${tagSlug}/${operation.operationId}`;
    const label = operation.summary ?? key;

    if (operation.deprecated !== true) {
      current.push(`| \`${key}\` | [${label}](${href}) |`);
      continue;
    }

    // Legacy payloads are keyed `<event>.<version>` so each format gets its own
    // page — but `composio.trigger.message.v2` is NOT an event type anyone ever
    // receives. Split the synthetic key back apart so the table shows the real
    // event plus the payload version it applies to.
    const versioned = /^(.*)\.(v\d+)$/.exec(key);
    const event = versioned ? versioned[1] : key;
    const version = versioned ? versioned[2].toUpperCase() : '—';
    legacy.push(`| \`${event}\` | ${version} | [${label}](${href}) |`);
  }

  const overview = readOverview(tagSlug);
  const body = overview ?? tag?.description ?? '';

  const legacySection =
    legacy.length > 0
      ? `

## Legacy payloads (deprecated)

Older subscriptions may still receive these payload formats. The event type is unchanged — only the payload shape differs, selected by the subscription's version. You can upgrade an existing subscription at any time by updating its \`version\` — see [Update a webhook subscription](/reference/api-reference/webhook-subscriptions/patchWebhookSubscriptionsById). New integrations should use the current events above.

| Event | Version | Description |
|-------|---------|-------------|
${legacy.join('\n')}`
      : '';

  const content = `---
title: ${tag?.name ?? 'Webhook Events'}
description: "${tag?.description ?? ''}"
---

{/* Auto-generated from openapi-webhooks.json. Edit the overview at api-overviews/${tagSlug}.mdx, not this file. */}

${body}

## Events

| Event | Description |
|-------|-------------|
${current.join('\n')}${legacySection}
`;

  const folderPath = join(outputDir, tagSlug);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(join(folderPath, 'index.mdx'), content);
  console.log(`Generated: ${tagSlug}/index.mdx (${current.length} events, ${legacy.length} legacy)`);
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
    const loadedSpecV3: OpenAPISpec = JSON.parse(readFileSync(specV3Path, 'utf-8'));
    v3Ops = getOperationsByTag(loadedSpecV3);
  }

  const v31TagDescriptions: Record<string, string> = {};
  for (const tag of specV31.tags) {
    v31TagDescriptions[tag.name] = tag.description || '';
  }
  const outputDir = join(process.cwd(), 'content/reference/api-reference');
  const webhookSpec = loadWebhookSpec();

  // `Webhook Events` is tagged only in openapi-webhooks.json, so it never appears
  // in the openapi.json-derived active set. Without folding it in, the section is
  // recursively deleted on every run (and immediately regenerated below) — and if
  // that ordering ever changed, the docs would silently lose the whole section.
  removeStaleTagIndexes(
    outputDir,
    new Set([...activeTagSlugs(v31Ops), ...webhookTagSlugs(webhookSpec)]),
  );
  removeStaleTagIndexes(
    join(process.cwd(), 'content/reference/v3/api-reference'),
    activeTagSlugs(v3Ops),
  );

  // Webhook events come from a separate 3.1 spec, so they're generated here
  // rather than in the tag loop below (which iterates openapi.json operations).
  generateWebhookEventsIndex(webhookSpec, outputDir);

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

    const tagDescription = v31TagDescriptions[tagName] || `${tagName} API endpoints`;
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
          // OpenAPI marks these `deprecated`; we surface them with the existing
          // "Legacy" tag rather than a separate one. Only emitted when true so
          // non-legacy pages stay byte-identical.
          ...(op.deprecated ? { legacy: true } : {}),
        };
      });

      const content = `---
title: ${displayTitle}
description: "${tagDescription}"
---

${genComment}

${body}

## Endpoints

<ApiEndpointsTable endpoints={${serializeEndpoints(endpoints, `${tagSlug} (v3.1)`)}} />
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
        // OpenAPI marks these `deprecated`; we surface them with the existing
        // "Legacy" tag rather than a separate one. Only emitted when true so
        // non-legacy pages stay byte-identical.
        ...(op.deprecated ? { legacy: true } : {}),
      }));

      const v3Content = `---
title: ${displayTitle}
description: "${tagDescription}"
---

${genComment}

${body}

## Endpoints

<ApiEndpointsTable endpoints={${serializeEndpoints(v3Endpoints, `${tagSlug} (v3.0)`)}} />
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
