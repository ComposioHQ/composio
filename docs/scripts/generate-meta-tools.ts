/**
 * Meta Tools Generator Script
 *
 * Fetches meta tool definitions from the Composio Tool Router API and generates:
 * - /public/data/meta-tools.json (complete meta tool schemas from API)
 * - /content/toolkits/meta-tools/meta.json (sidebar navigation)
 * - /content/toolkits/meta-tools/index.mdx (overview page)
 * - /content/toolkits/meta-tools/{name}.mdx (individual tool pages)
 *
 * All output is derived from the API response — no hardcoded tool definitions.
 *
 * Run: bun run generate:meta-tools
 *
 * Environment variables:
 * - COMPOSIO_API_KEY (required)
 * - COMPOSIO_API_BASE (optional, must resolve to https://backend.composio.dev/api/v3)
 */

import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { fetchWithRetry } from './fetch-with-retry';
import { META_TOOL_OVERRIDES } from '../lib/meta-tool-overrides';
import { requireProductionApiV3Url, stripStagingHosts } from './production-api.mjs';
import { z } from 'zod';

const API_BASE = requireProductionApiV3Url(process.env.COMPOSIO_API_BASE);
const API_KEY = process.env.COMPOSIO_API_KEY;

/** The docs generator intentionally mirrors the public Composio Connect MCP surface. */
export const CONNECT_META_TOOL_SLUGS = [
  'COMPOSIO_SEARCH_TOOLS',
  'COMPOSIO_GET_TOOL_SCHEMAS',
  'COMPOSIO_MANAGE_CONNECTIONS',
  'COMPOSIO_WAIT_FOR_CONNECTIONS',
  'COMPOSIO_MULTI_EXECUTE_TOOL',
  'COMPOSIO_REMOTE_WORKBENCH',
  'COMPOSIO_REMOTE_BASH_TOOL',
] as const;

const DATA_DIR = join(process.cwd(), 'public/data');
const CONTENT_DIR = join(process.cwd(), 'content/toolkits/meta-tools');

interface GeneratedMetaTool {
  slug: string;
  name: string;
  displayName: string;
  description: string;
  tags: string[];
  toolkit: string | Record<string, unknown> | null;
  inputParameters: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
}

// Zod schemas for the Tool Router payloads this script consumes. Parsing is
// lenient: malformed fields degrade to empty fallbacks instead of aborting.

const stringArraySchema = z
  .array(z.unknown())
  .catch([])
  .transform(items =>
    items.flatMap(item => {
      const parsed = z.string().safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
  );

const recordSchema = z.record(z.string(), z.unknown()).catch({});

const sessionResponseSchema = z
  .object({
    session_id: z.string().optional().catch(undefined),
    tool_router_tools: stringArraySchema,
  })
  .catch({ session_id: undefined, tool_router_tools: [] });

const metaToolListSchema = z.union([
  z.object({ items: z.array(z.unknown()) }).transform(data => data.items),
  z.array(z.unknown()),
]);

const rawMetaToolSchema = z.object({
  slug: z.string().catch(''),
  name: z.string().catch(''),
  description: z.string().catch(''),
  tags: stringArraySchema,
  toolkit: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .catch(undefined),
  input_parameters: recordSchema,
  output_parameters: recordSchema,
});

async function createSession(): Promise<string> {
  console.log('Creating session...');

  const response = await fetchWithRetry(`${API_BASE}/tool_router/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
    body: JSON.stringify({
      // Connect explicitly enables the optional WAIT helper; generic sessions default it off.
      user_id: 'default',
      manage_connections: {
        enable: true,
        enable_wait_for_connections: true,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create session: ${response.status} ${response.statusText}\n${body}`);
  }

  const data = sessionResponseSchema.parse(await response.json());
  const sessionId = data.session_id;

  if (!sessionId) {
    throw new Error('No session_id in response');
  }

  assertConnectMetaTools(data.tool_router_tools);

  console.log(`  Session created: ${sessionId}`);
  console.log(`  Tools available: ${data.tool_router_tools.join(', ')}`);
  return sessionId;
}

export function assertConnectMetaTools(toolSlugs: string[]): void {
  const missing = CONNECT_META_TOOL_SLUGS.filter(slug => !toolSlugs.includes(slug));
  if (missing.length > 0) {
    throw new Error(
      `Missing meta tools for the Connect-shaped docs session: ${missing.join(', ')}. Check the session request before publishing generated meta-tool reference data.`
    );
  }
}

async function fetchMetaTools(sessionId: string): Promise<unknown[]> {
  console.log('Fetching meta tools with schemas...');

  const response = await fetchWithRetry(`${API_BASE}/tool_router/session/${sessionId}/tools`, {
    headers: {
      'x-api-key': API_KEY!,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch meta tools: ${response.status} ${response.statusText}\n${body}`
    );
  }

  const parsed = metaToolListSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Expected array of tools in response');
  }

  console.log(`  Found ${parsed.data.length} meta tools`);
  return parsed.data;
}

export function transformTool(value: unknown): GeneratedMetaTool {
  const parsed = rawMetaToolSchema.safeParse(value);
  const raw = parsed.success ? parsed.data : rawMetaToolSchema.parse({});
  const { slug, name } = raw;

  return {
    slug,
    name,
    displayName: name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || slug,
    description: raw.description,
    tags: raw.tags,
    toolkit: raw.toolkit || null,
    inputParameters: raw.input_parameters,
    responseSchema: raw.output_parameters,
  };
}

/** Derive a short page slug from the tool slug: COMPOSIO_SEARCH_TOOLS -> search_tools */
export function pageSlug(toolSlug: string): string {
  return toolSlug.toLowerCase().replace('composio_', '');
}

/** Truncate description to first sentence for index table */
export function briefDescription(description: string): string {
  // Strip markdown and leading whitespace
  const cleaned = description.replace(/\*\*/g, '').replace(/__/g, '').replace(/\n+/g, ' ').trim();
  const firstSentence = cleaned.split(/\.(\s|$)/)[0];
  if (firstSentence.length > 120) {
    return firstSentence.slice(0, 117) + '...';
  }
  return firstSentence;
}

/** One-line summary for the index table. Prefer hand-written override copy, fall back to the API description. */
function indexLine(tool: GeneratedMetaTool): string {
  const override = META_TOOL_OVERRIDES[tool.slug];
  if (override) {
    // First sentence of the hand-written summary keeps the table tight.
    const firstSentence = override.summary.split(/\.(\s|$)/)[0].trim();
    return firstSentence.replace(/\|/g, '\\|');
  }
  return briefDescription(tool.description).replace(/\|/g, '\\|');
}

/** Generate the index.mdx overview page — Modal-voice intro plus a one-line-per-tool table */
function generateIndexMdx(tools: GeneratedMetaTool[]): string {
  let content = `---
title: Meta Tools
description: The configurable Tool Router helpers agents use to discover, authenticate, execute, and process tools at runtime.
keywords: [meta tools, session]
---

{/* Auto-generated by scripts/generate-meta-tools.ts — do not edit manually. To change the intro prose or a tool's one-line summary, edit the template and the override map in lib/meta-tool-overrides.ts. */}

import { Callout } from 'fumadocs-ui/components/callout';

A Composio [session](/docs/how-composio-works) exposes a configurable set of meta tools instead of hundreds of raw tool definitions. The agent uses the enabled helpers to find the right tools for a task, connect the accounts those tools need, execute them, and process the results, all at runtime and all sharing one \`session_id\`.

This keeps your context window small: you load a handful of meta tools, not a catalog of 500+ apps. The agent searches for what it needs when it needs it.

A typical workflow runs in order: call \`COMPOSIO_SEARCH_TOOLS\` to discover tools, call \`COMPOSIO_MANAGE_CONNECTIONS\` if a toolkit is not connected, show the returned authentication link, and—when the optional helper is enabled—call \`COMPOSIO_WAIT_FOR_CONNECTIONS\` before execution. Run tools with \`COMPOSIO_MULTI_EXECUTE_TOOL\`; reach for workbench and bash when responses are large enough to process out of context.

<Callout type="info">
Tool Router supports seven helper-tool types. A default session exposes six because \`COMPOSIO_WAIT_FOR_CONNECTIONS\` is opt-in. Composio Connect enables all seven; other session flags can reduce the exposed set further.
</Callout>

| Tool | What it does |
|------|--------------|
`;

  for (const tool of tools) {
    content += `| [\`${tool.slug}\`](/toolkits/meta-tools/${pageSlug(tool.slug)}) | ${indexLine(tool)} |\n`;
  }

  content += `
<Callout type="warn">
These schemas are for reference only. We do not guarantee backward compatibility for parameter names or response shapes, so do not rely on them as structured type definitions in your code.
</Callout>
`;

  return content;
}

/** Generate an individual tool MDX page */
function generateToolMdx(tool: GeneratedMetaTool): string {
  const desc = briefDescription(tool.description).replace(/"/g, '\\"');

  return `---
title: ${tool.displayName}
description: "${desc}"
keywords: [${tool.slug}, meta tool]
---

{/* Auto-generated by scripts/generate-meta-tools.ts — do not edit manually */}

import { MetaToolDetailServer } from '@/components/meta-tools/meta-tool-page';

<MetaToolDetailServer slug="${tool.slug}" />
`;
}

/** Generate meta.json for sidebar navigation — index.mdx is the folder page */
function generateMetaJson(tools: GeneratedMetaTool[]): string {
  const pages = tools.map(t => pageSlug(t.slug));
  return JSON.stringify({ title: 'Meta Tools', defaultOpen: true, pages }, null, 2) + '\n';
}

async function cleanGeneratedMdx() {
  try {
    const files = await readdir(CONTENT_DIR);
    for (const file of files) {
      if (file.endsWith('.mdx') || file === 'meta.json') {
        await unlink(join(CONTENT_DIR, file));
      }
    }
  } catch {
    // Directory doesn't exist yet, that's fine
  }
}

async function main() {
  console.log('Starting meta tools generation...\n');

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(CONTENT_DIR, { recursive: true });

  const sessionId = await createSession();
  const rawTools = await fetchMetaTools(sessionId);
  const metaTools = rawTools.map(transformTool);

  // Sort alphabetically by slug
  metaTools.sort((a, b) => a.slug.localeCompare(b.slug));

  // 1. Write JSON data
  await writeFile(
    join(DATA_DIR, 'meta-tools.json'),
    stripStagingHosts(JSON.stringify(metaTools, null, 2))
  );
  console.log(
    `\nWrote public/data/meta-tools.json (~${Math.round(JSON.stringify(metaTools).length / 1024)}KB)`
  );

  // 2. Clean old generated MDX files and regenerate
  await cleanGeneratedMdx();

  // 3. Write meta.json
  await writeFile(join(CONTENT_DIR, 'meta.json'), generateMetaJson(metaTools));
  console.log('Wrote content/toolkits/meta-tools/meta.json');

  // 4. Write index.mdx
  await writeFile(join(CONTENT_DIR, 'index.mdx'), generateIndexMdx(metaTools));
  console.log('Wrote content/toolkits/meta-tools/index.mdx');

  // 5. Write individual tool pages
  for (const tool of metaTools) {
    const filename = `${pageSlug(tool.slug)}.mdx`;
    await writeFile(join(CONTENT_DIR, filename), generateToolMdx(tool));
    console.log(`Wrote content/toolkits/meta-tools/${filename}`);
  }

  console.log(`\nGeneration complete! ${metaTools.length} meta tools.`);
  console.log(`Tools: ${metaTools.map(t => t.slug).join(', ')}`);
}

if (import.meta.main) {
  if (!API_KEY) {
    console.error('Error: COMPOSIO_API_KEY environment variable is required');
    process.exit(1);
  }

  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
