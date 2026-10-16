import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { ContentFreshnessManifest } from './content-freshness';

export interface FreshnessPage {
  pathname: string;
  /** Absolute or docs-root-relative backing source files, never generated outputs. */
  sources: string[];
  lastUpdated?: string;
}

/** Date-only declarations mean midnight UTC; timestamps must include a timezone. */
export function normalizeLastUpdated(value: string): string | null {
  if (z.iso.date().safeParse(value).success) return `${value}T00:00:00.000Z`;
  if (!z.iso.datetime({ offset: true }).safeParse(value).success) return null;
  return new Date(value).toISOString();
}

/** Only this explicit field is freshness metadata, not release/written/review dates. */
export function getExplicitLastUpdated(raw: string): string | undefined {
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const value = frontmatter?.match(/^last_updated:[ \t]*(.*?)[ \t]*$/m)?.[1];
  if (value === undefined) return undefined;
  const unquoted = value.replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
  if (!normalizeLastUpdated(unquoted)) throw new Error(`Invalid last_updated: ${value}`);
  return unquoted;
}

function getSourceHistory(root: string): Map<string, string | null> {
  const history = new Map<string, string | null>();
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  try {
    const repository = git('rev-parse', '--show-toplevel');
    const shallowPath = git('rev-parse', '--git-path', 'shallow');
    let boundaries = new Set<string>();
    try {
      boundaries = new Set(readFileSync(resolve(root, shallowPath), 'utf8').trim().split('\n'));
    } catch {
      // A complete repository has no shallow file.
    }
    const log = git('log', '--format=%x1e%H%x00%cI', '--name-only', '--no-renames', '--', '.');
    for (const record of log.split('\x1e')) {
      const [header, ...files] = record.trim().split('\n');
      if (!header) continue;
      const [hash, timestamp] = header.split('\0');
      const date = timestamp ? normalizeLastUpdated(timestamp) : null;
      for (const file of files) {
        if (!file) continue;
        const absolutePath = resolve(repository, file);
        if (!history.has(absolutePath)) {
          // Git presents every file as added at a shallow boundary; that is not evidence.
          history.set(absolutePath, hash && boundaries.has(hash) ? null : date);
        }
      }
    }
  } catch {
    // Source archives and deployments without Git must not invent modification dates.
  }
  return history;
}

export function buildContentFreshness(
  root: string,
  pages: FreshnessPage[],
  sourceLastUpdated: Record<string, string> = {},
): ContentFreshnessManifest {
  const history = getSourceHistory(root);
  const manifest: ContentFreshnessManifest = { version: 1, pages: {} };
  for (const page of pages) {
    if (page.lastUpdated !== undefined) {
      const explicit = normalizeLastUpdated(page.lastUpdated);
      if (!explicit) throw new Error(`Invalid last_updated for ${page.pathname}: ${page.lastUpdated}`);
      manifest.pages[page.pathname] = explicit;
      continue;
    }
    const dates = [...new Set(page.sources)].map(source => {
      const absolutePath = isAbsolute(source) ? source : resolve(root, source);
      const explicit = sourceLastUpdated[absolutePath];
      if (explicit !== undefined) {
        const timestamp = normalizeLastUpdated(explicit);
        if (!timestamp) throw new Error(`Invalid last_updated for ${source}: ${explicit}`);
        return timestamp;
      }
      return history.get(absolutePath) ?? null;
    });
    // A partially-known aggregate is not a reliable last-modification timestamp.
    if (dates.length === 0 || dates.some(date => date === null)) continue;
    const known = dates.filter((date): date is string => date !== null);
    manifest.pages[page.pathname] = known.reduce((latest, date) => date > latest ? date : latest);
  }
  return manifest;
}
