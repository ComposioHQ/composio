/**
 * Verify published KB guides against current production data.
 *
 * Runs from docs/: `bun run verify:kb [--check-links] [--json] [--markdown <path>]`
 *
 * Designed to run inside `docs-update-data.yml`, immediately after that job
 * refreshes `public/data/toolkits.json` and the OpenAPI specs. Freshness is then
 * checked against the same production snapshot the docs site ships, on every
 * production deploy, rather than on a review calendar.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildKbCatalog } from '@/lib/kb/catalog';
import { createKbArticleReader } from '@/lib/kb/repository';
import {
  buildProductCatalog,
  renderVerifyReport,
  verifyKb,
  type CatalogToolkit,
  type KbVerifyReport,
} from '@/lib/kb/verify';
import type { KbManifest } from '@/lib/kb/types';

const KB_ROOT = join(process.cwd(), 'kb');
const TOOLKITS_PATH = join(process.cwd(), 'public/data/toolkits.json');
const LINK_CONCURRENCY = 8;
const LINK_TIMEOUT_MS = 10_000;

interface CliOptions {
  checkLinks: boolean;
  json: boolean;
  markdownPath: string | null;
  warningsAsErrors: boolean;
}

function parseOptions(argumentsList: string[]): CliOptions {
  const allowed = new Set([
    '--check-links',
    '--json',
    '--markdown',
    '--warnings-as-errors',
  ]);
  const options: CliOptions = {
    checkLinks: argumentsList.includes('--check-links'),
    json: argumentsList.includes('--json'),
    markdownPath: null,
    warningsAsErrors: argumentsList.includes('--warnings-as-errors'),
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument?.startsWith('--')) continue;
    if (!allowed.has(argument)) throw new Error(`Unknown option: ${argument}`);
    if (argument === '--markdown') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing path after --markdown');
      options.markdownPath = value;
      index += 1;
    }
  }

  return options;
}

/**
 * `buildKbCatalog` rejects expired time-sensitive guides. The verifier must still
 * report them, so catalog assembly runs with a floor date and `verifyKb` checks
 * every published guide's review deadline against the real clock.
 */
function loadCatalogIgnoringExpiry() {
  const manifest = JSON.parse(readFileSync(join(KB_ROOT, 'manifest.json'), 'utf8')) as KbManifest;
  const catalog = buildKbCatalog(
    manifest,
    (sourcePath) => readFileSync(join(KB_ROOT, 'source', sourcePath), 'utf8'),
    new Date(0),
    createKbArticleReader(join(KB_ROOT, 'articles'))
  );
  return catalog;
}

async function resolveLinkStatuses(urls: string[]): Promise<Map<string, number | 'unreachable'>> {
  const statuses = new Map<string, number | 'unreachable'>();
  const queue = [...urls];

  async function worker(): Promise<void> {
    for (let url = queue.shift(); url; url = queue.shift()) {
      statuses.set(url, await probe(url));
    }
  }

  await Promise.all(Array.from({ length: LINK_CONCURRENCY }, () => worker()));
  return statuses;
}

async function probe(url: string): Promise<number | 'unreachable'> {
  // Some provider docs reject HEAD but serve GET, so a failed HEAD is retried
  // as a GET before the link is called dead.
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const response = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(LINK_TIMEOUT_MS),
        headers: { 'user-agent': 'composio-docs-kb-verify' },
      });
      if (response.ok || method === 'GET') return response.status;
    } catch {
      if (method === 'GET') return 'unreachable';
    }
  }
  return 'unreachable';
}

function exitCodeFor(report: KbVerifyReport, options: CliOptions): number {
  const failing = report.findings.filter(
    (finding) => finding.severity === 'error' || options.warningsAsErrors
  );
  return failing.length ? 1 : 0;
}

export async function runVerifyKb(argumentsList: string[]): Promise<number> {
  const options = parseOptions(argumentsList);
  const catalog = loadCatalogIgnoringExpiry();
  const toolkits = JSON.parse(readFileSync(TOOLKITS_PATH, 'utf8')) as CatalogToolkit[];
  if (!Array.isArray(toolkits)) {
    throw new Error('Expected public/data/toolkits.json to contain an array');
  }
  const productCatalog = buildProductCatalog(toolkits);

  // First pass collects the external links; the network probe only runs when asked.
  const dryRun = verifyKb({
    manifest: catalog.manifest,
    guides: catalog.guides,
    catalog: productCatalog,
    now: new Date(),
  });

  const linkStatuses = options.checkLinks
    ? await resolveLinkStatuses(dryRun.externalLinks)
    : undefined;

  const report =
    linkStatuses
      ? verifyKb({
          manifest: catalog.manifest,
          guides: catalog.guides,
          catalog: productCatalog,
          now: new Date(),
          options: { linkStatuses },
        })
      : dryRun;

  const markdown = renderVerifyReport(report);
  if (options.markdownPath) writeFileSync(options.markdownPath, `${markdown}\n`);
  console.log(options.json ? JSON.stringify(report, null, 2) : markdown);

  return exitCodeFor(report, options);
}

if (import.meta.main) {
  runVerifyKb(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(2);
    });
}
