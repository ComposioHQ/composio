/**
 * Shared docs access for the agent's retrieval tools.
 *
 * Builds a lazy in-memory index over `content/` plus the curated
 * `agent/knowledge.md`, maps page URLs to files, and flags legacy pages so the
 * search tool can heavily downrank them.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP_ROOT = process.cwd();
const CONTENT_ROOT = join(APP_ROOT, 'content');
const KNOWLEDGE_FILE = join(APP_ROOT, 'agent', 'knowledge.md');
const COLLECTIONS = ['docs', 'reference', 'examples', 'toolkits'] as const;

/** URL prefixes for the legacy, pre-session / direct-execution docs. */
const LEGACY_URL_PATTERNS = [
  '/docs/tools-direct',
  '/docs/auth-configuration',
  '/docs/sessions-vs-direct-execution',
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'for', 'with', 'as', 'at', 'by', 'from', 'how', 'do',
  'does', 'did', 'what', 'why', 'when', 'which', 'who', 'can', 'i', 'you', 'it',
  'this', 'that', 'these', 'those', 'my', 'your', 'we', 'they', 'use', 'using',
  'work', 'works', 'about', 'into', 'so', 'if', 'me', 'get', 'set', 'up',
]);

export interface DocPage {
  title: string;
  description: string;
  url: string;
  legacy: boolean;
  /** Headings, lowercased, for ranking. */
  headings: string[];
  /** Original-case plain text for snippets. */
  text: string;
  /** Lowercased title + description + text for scoring. */
  lowerText: string;
}

/** Mirror of lib/search-index.ts `urlFromContentPath` so links match real routes. */
export function urlFromContentPath(absPath: string): string | undefined {
  const rel = relative(CONTENT_ROOT, absPath).replace(/\\/g, '/');
  const withoutExt = rel.replace(/\.mdx?$/, '');
  const parts = withoutExt.split('/');
  const collection = parts.shift();
  if (!collection) return undefined;
  if (collection === 'docs') return `/docs/${parts.join('/')}`.replace(/\/index$/, '');
  if (collection === 'examples') return `/examples/${parts.join('/')}`.replace(/\/index$/, '');
  if (collection === 'reference') return `/reference/${parts.join('/')}`.replace(/\/index$/, '');
  if (collection === 'toolkits') {
    if (parts[0] === 'faq') return undefined;
    return `/toolkits/${parts.join('/')}`.replace(/\/index$/, '');
  }
  return undefined;
}

export function isLegacyUrl(url: string): boolean {
  return LEGACY_URL_PATTERNS.some((p) => url === p || url.startsWith(`${p}/`));
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function parseFrontmatter(raw: string): {
  title: string;
  description: string;
  legacy: boolean;
  body: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { title: '', description: '', legacy: false, body: raw };
  const [, fm, body] = match;
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  return { title: get('title'), description: get('description'), legacy: get('legacy') === 'true', body };
}

/** Strip MDX/JSX noise to readable text (keeps prose and inline code words). */
function toPlainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clean MDX into Markdown the model can read: drop frontmatter and bare JSX tags. */
export function toCleanMarkdown(raw: string): string {
  const { body } = parseFrontmatter(raw);
  return body
    .replace(/<\/?[A-Za-z][A-Za-z0-9.]*(\s[^>]*)?\/?>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function makePage(args: {
  title: string;
  description: string;
  url: string;
  legacy: boolean;
  body: string;
}): DocPage {
  const headings = (args.body.match(/^#{1,4}\s+(.+)$/gm) ?? []).map((h) =>
    h.replace(/^#{1,4}\s+/, '').toLowerCase().trim(),
  );
  const text = toPlainText(args.body);
  return {
    title: args.title || args.url,
    description: args.description,
    url: args.url,
    legacy: args.legacy,
    headings,
    text,
    lowerText: `${args.title} ${args.description} ${text}`.toLowerCase(),
  };
}

/**
 * Parse `agent/knowledge.md` into searchable entries. Each `## Title (/url)`
 * section becomes one entry linked to its canonical doc page.
 */
function loadKnowledge(): DocPage[] {
  let raw: string;
  try {
    raw = readFileSync(KNOWLEDGE_FILE, 'utf8');
  } catch {
    return [];
  }
  const pages: DocPage[] = [];
  const sectionRe = /^##\s+(.+?)\s*(?:\(([^)]+)\))?\s*$/gm;
  const matches = [...raw.matchAll(sectionRe)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const title = m[1].trim();
    const url = (m[2] ?? '').trim() || '/docs';
    const bodyStart = m.index! + m[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index! : raw.length;
    const body = raw.slice(bodyStart, bodyEnd).trim();
    pages.push(makePage({ title, description: '', url, legacy: false, body }));
  }
  return pages;
}

let indexCache: DocPage[] | undefined;

export function buildIndex(): DocPage[] {
  if (indexCache) return indexCache;
  const pages: DocPage[] = [];
  for (const collection of COLLECTIONS) {
    const dir = join(CONTENT_ROOT, collection);
    let entries: string[];
    try {
      entries = readdirSync(dir, { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/\.mdx?$/.test(entry)) continue;
      const absPath = join(dir, entry);
      const url = urlFromContentPath(absPath);
      if (!url) continue;
      let raw: string;
      try {
        raw = readFileSync(absPath, 'utf8');
      } catch {
        continue;
      }
      const { title, description, legacy, body } = parseFrontmatter(raw);
      pages.push(makePage({ title, description, url, legacy: legacy || isLegacyUrl(url), body }));
    }
  }
  pages.push(...loadKnowledge());
  indexCache = pages;
  return pages;
}

/** Resolve a page URL back to its source file and return the raw MDX. */
export function readPageByUrl(url: string): { title: string; raw: string } | undefined {
  const clean = url.split('#')[0].split('?')[0].replace(/\/$/, '');
  const parts = clean.split('/').filter(Boolean);
  const collection = parts.shift();
  if (!collection || !COLLECTIONS.includes(collection as (typeof COLLECTIONS)[number])) return undefined;
  const base = join(CONTENT_ROOT, collection, ...parts);
  const candidates = [`${base}.mdx`, `${base}.md`, join(base, 'index.mdx'), join(base, 'index.md')];
  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf8');
      const { title } = parseFrontmatter(raw);
      return { title: title || url, raw };
    } catch {
      // try next candidate
    }
  }
  return undefined;
}
