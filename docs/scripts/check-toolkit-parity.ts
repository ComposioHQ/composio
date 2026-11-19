/**
 * Checks that the deployed toolkit Markdown pages list the tools production
 * serves, for the toolkits with the most tools.
 *
 * It also checks the toolkit list behind /api/toolkits/instant.
 *
 * Failures caught:
 * - A deployed page lists a tool count matching neither production nor the
 *   committed snapshot. This is how a stale Next.js data-cache entry shows up:
 *   tableau.md listed 10 tools for days after production and the snapshot
 *   both had 436.
 * - A production list page at TOOL_PAGE_SIZE would make a cache entry over
 *   PAGE_BYTES_BUDGET. Next.js does not cache an entry over 2 MiB, and an entry
 *   holds the body base64-encoded, so a page near 1.5 MiB will go stale once it
 *   grows past that.
 * - The deployed /api/toolkits/instant slugs differ from production, or a
 *   production /toolkits page exceeds PAGE_BYTES_BUDGET.
 *
 * Usage: COMPOSIO_API_KEY=... bun scripts/check-toolkit-parity.ts [--top 30] [--markdown report.md]
 */
import { writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  createComposioClient,
  listToolkits,
  listToolkitTools,
  TOOL_PAGE_SIZE,
  TOOLKIT_PAGE_SIZE,
} from '../lib/composio-api';
import { instantToolkitSlugs } from '../lib/instant-toolkit-api';
import { fetchWithRetry } from './fetch-with-retry';

/** The most items one API list request returns. */
export const API_LIST_PAGE_LIMIT = 1000;

/** The Next.js data-cache entry limit, measured on the serialized entry. */
export const CACHE_ENTRY_LIMIT = 2 * 1024 * 1024;

/** Alert when an entry reaches 85% of the limit. */
export const PAGE_BYTES_BUDGET = Math.floor(CACHE_ENTRY_LIMIT * 0.85);

/**
 * The size Next.js counts for a cached response: the body is stored
 * base64-encoded, so an entry is about 4/3 of the raw body.
 */
export function cacheEntryBytes(responseBytes: number): number {
  return Math.ceil(responseBytes / 3) * 4;
}

const DOCS_BASE_URL = 'https://docs.composio.dev';
const SNAPSHOT_PATH = fileURLToPath(new URL('../public/data/toolkits.json', import.meta.url));

export interface ToolkitObservation {
  slug: string;
  snapshotCount: number;
  productionCount: number;
  deployedCount: number;
  largestPageBytes: number;
}

/** Counts the tools listed in the "## Tools" section of a toolkit Markdown page. */
export function countMarkdownTools(markdown: string): number {
  const start = markdown.indexOf('\n## Tools\n');
  if (start === -1) return 0;
  const next = markdown.indexOf('\n## ', start + 1);
  const section = markdown.slice(start, next === -1 ? undefined : next);
  return section.match(/^\*\*Slug:\*\* `/gm)?.length ?? 0;
}

/** Describes every way one toolkit's observation breaks parity or the page budget. */
export function findProblems(observation: ToolkitObservation): string[] {
  const { slug, snapshotCount, productionCount, deployedCount, largestPageBytes } = observation;
  const problems: string[] = [];
  if (deployedCount !== productionCount && deployedCount !== snapshotCount) {
    problems.push(
      `${slug}.md lists ${deployedCount} tools; production has ${productionCount}, the snapshot has ${snapshotCount}`
    );
  }
  if (snapshotCount === API_LIST_PAGE_LIMIT && productionCount > API_LIST_PAGE_LIMIT) {
    problems.push(
      `the ${slug} snapshot stops at ${snapshotCount} of ${productionCount} tools, the API page cap; generate:toolkits did not follow next_cursor`
    );
  }
  if (cacheEntryBytes(largestPageBytes) > PAGE_BYTES_BUDGET) {
    problems.push(
      `${slug} has a ${largestPageBytes}-byte tools page (${cacheEntryBytes(largestPageBytes)}-byte cache entry) at TOOL_PAGE_SIZE ${TOOL_PAGE_SIZE}, over the ${PAGE_BYTES_BUDGET}-byte entry budget; lower TOOL_PAGE_SIZE in lib/composio-api.ts`
    );
  }
  return problems;
}

export interface InstantObservation {
  productionSlugs: string[];
  deployedSlugs: string[];
  largestPageBytes: number;
}

/** Describes how the deployed Instant toolkit list differs from production. */
export function findInstantProblems({ productionSlugs, deployedSlugs, largestPageBytes }: InstantObservation): string[] {
  const problems: string[] = [];
  const deployed = new Set(deployedSlugs);
  const production = new Set(productionSlugs);
  const missing = productionSlugs.filter(slug => !deployed.has(slug));
  const extra = deployedSlugs.filter(slug => !production.has(slug));
  if (missing.length > 0 || extra.length > 0) {
    problems.push(
      `/api/toolkits/instant lists ${deployedSlugs.length} toolkits; production has ${productionSlugs.length} (missing: ${missing.slice(0, 5).join(', ') || 'none'}; extra: ${extra.slice(0, 5).join(', ') || 'none'})`
    );
  }
  if (cacheEntryBytes(largestPageBytes) > PAGE_BYTES_BUDGET) {
    problems.push(
      `a ${largestPageBytes}-byte /toolkits page (${cacheEntryBytes(largestPageBytes)}-byte cache entry) at TOOLKIT_PAGE_SIZE ${TOOLKIT_PAGE_SIZE}, over the ${PAGE_BYTES_BUDGET}-byte entry budget; lower TOOLKIT_PAGE_SIZE in lib/composio-api.ts`
    );
  }
  return problems;
}

const snapshotSchema = z.array(z.object({ slug: z.string(), toolCount: z.number() }));

/** A production client that records the size of the largest response body it reads. */
function measuringClient(apiKey: string) {
  let largestPageBytes = 0;
  const client = createComposioClient(apiKey, {
    maxRetries: 0,
    timeout: 10 * 60_000,
    fetch: async (input, init) => {
      const response = await fetchWithRetry(String(input), init);
      largestPageBytes = Math.max(largestPageBytes, Buffer.byteLength(await response.clone().text()));
      return response;
    },
  });
  return { client, largestPageBytes: () => largestPageBytes };
}

async function observeProduction(slug: string, apiKey: string) {
  const { client, largestPageBytes } = measuringClient(apiKey);
  const tools = await listToolkitTools(client, slug);
  return { productionCount: tools.length, largestPageBytes: largestPageBytes() };
}

async function observeInstant(apiKey: string): Promise<InstantObservation> {
  const { client, largestPageBytes } = measuringClient(apiKey);
  const toolkits = await listToolkits(client);

  const response = await fetchWithRetry(`${DOCS_BASE_URL}/api/toolkits/instant`);
  if (!response.ok) throw new Error(`/api/toolkits/instant responded ${response.status}`);
  const deployed = z.object({ slugs: z.array(z.string()) }).parse(await response.json());
  return { productionSlugs: instantToolkitSlugs(toolkits), deployedSlugs: deployed.slugs, largestPageBytes: largestPageBytes() };
}

async function observeDeployed(slug: string): Promise<number> {
  const response = await fetchWithRetry(`${DOCS_BASE_URL}/toolkits/${slug}.md`);
  if (!response.ok) throw new Error(`${slug}.md responded ${response.status}`);
  return countMarkdownTools(await response.text());
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error('COMPOSIO_API_KEY is required');
  const top = Number(argValue('--top') ?? 30);
  const markdownPath = argValue('--markdown');

  const snapshot = snapshotSchema.parse(JSON.parse(await readFile(SNAPSHOT_PATH, 'utf-8')));
  const toolkits = [...snapshot].sort((a, b) => b.toolCount - a.toolCount).slice(0, top);

  const problems: string[] = [];
  const rows: string[] = [];
  for (const toolkit of toolkits) {
    try {
      const production = await observeProduction(toolkit.slug, apiKey);
      const deployedCount = await observeDeployed(toolkit.slug);
      const observation = { slug: toolkit.slug, snapshotCount: toolkit.toolCount, deployedCount, ...production };
      problems.push(...findProblems(observation));
      rows.push(
        `| ${toolkit.slug} | ${toolkit.toolCount} | ${production.productionCount} | ${deployedCount} | ${production.largestPageBytes} |`
      );
    } catch (error) {
      problems.push(`${toolkit.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const instant = await observeInstant(apiKey);
    problems.push(...findInstantProblems(instant));
    rows.push(
      `| (Instant toolkit list) | n/a | ${instant.productionSlugs.length} | ${instant.deployedSlugs.length} | ${instant.largestPageBytes} |`
    );
  } catch (error) {
    problems.push(`Instant toolkit list: ${error instanceof Error ? error.message : String(error)}`);
  }

  const report = [
    problems.length === 0 ? '✅ Toolkit pages match production.' : `❌ ${problems.length} toolkit parity problem(s):`,
    '',
    ...problems.map(problem => `- ${problem}`),
    '',
    '| Toolkit | Snapshot | Production | Deployed .md | Largest page (bytes) |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
  console.log(report);
  if (markdownPath) await writeFile(markdownPath, report);
  process.exit(problems.length === 0 ? 0 : 1);
}

if (import.meta.main) await main();
