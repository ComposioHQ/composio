/**
 * Shared docs access for the agent's retrieval tools.
 *
 * Builds a lazy in-memory index over `content/` plus the curated
 * `agent/knowledge.md`, maps page URLs to files, and flags legacy pages so the
 * search tool can heavily downrank them.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Build-time snapshot of content/, imported so eve bundles it into the deployed
// service. The deployed runtime has the agent/ dir but NOT content/, so we fall
// back to this bundle whenever the content tree isn't on disk. Regenerate with
// `bun scripts/build-agent-index.ts` (runs automatically on dev/build).
import bundledIndex from './docs-index';

/**
 * Resolve the docs app root (the directory containing `content/docs`) without
 * assuming the runtime's `process.cwd()`. In a deployed eve function the cwd may
 * not be `docs/`, so we probe the cwd, `cwd/docs`, and the ancestors of this
 * module until we find the content tree.
 */
function resolveAppRoot(): string {
  const candidates: string[] = [process.cwd(), join(process.cwd(), 'docs')];
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 10; i++) {
      candidates.push(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // import.meta.url unavailable (e.g. CJS) — rely on the cwd candidates.
  }
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'content', 'docs'))) return candidate;
  }
  return process.cwd();
}

const APP_ROOT = resolveAppRoot();
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
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'as',
  'at',
  'by',
  'from',
  'how',
  'do',
  'does',
  'did',
  'what',
  'why',
  'when',
  'which',
  'who',
  'can',
  'i',
  'you',
  'it',
  'this',
  'that',
  'these',
  'those',
  'my',
  'your',
  'we',
  'they',
  'use',
  'using',
  'work',
  'works',
  'about',
  'into',
  'so',
  'if',
  'me',
  'get',
  'set',
  'up',
]);

export type Collection = 'docs' | 'examples' | 'reference' | 'toolkits' | 'knowledge';

export interface DocPage {
  collection: Collection;
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

interface BundlePage {
  collection: Collection;
  url: string;
  title: string;
  description: string;
  legacy: boolean;
  /** Cleaned Markdown body (no frontmatter), enough for search + read_doc. */
  markdown: string;
}
interface BundleToolkit {
  slug?: string;
  name?: string;
  description?: string;
  category?: string;
  authSchemes?: string[];
}
export interface BundleSearchIndex {
  averageLength: number;
  documentFrequency: [string, number][];
  entries: {
    key: string;
    length: number;
    terms: [string, number][];
  }[];
}
const BUNDLE = bundledIndex as {
  pages: BundlePage[];
  toolkits: BundleToolkit[];
  search?: BundleSearchIndex;
};

/**
 * Whether the live content tree is on disk. True in dev / local (read fresh
 * files); false in the deployed eve service (use the bundled snapshot). Set
 * `EVE_FORCE_BUNDLE=1` to exercise the bundle path locally.
 */
const CONTENT_AVAILABLE =
  process.env.EVE_FORCE_BUNDLE !== '1' && existsSync(join(CONTENT_ROOT, 'docs'));

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
  return LEGACY_URL_PATTERNS.some(p => url === p || url.startsWith(`${p}/`));
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

export function parseFrontmatter(raw: string): {
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
  return {
    title: get('title'),
    description: get('description'),
    legacy: get('legacy') === 'true',
    body,
  };
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

/**
 * Extract a page's section anchors from its Markdown headings, so the assistant
 * can link a specific section (e.g. `/docs/how-composio-works#users`) instead
 * of just the page. Anchor slugs match the docs' heading-id convention.
 */
export function extractSections(markdown: string): { title: string; anchor: string }[] {
  return [...markdown.matchAll(/^#{2,4}\s+(.+?)\s*$/gm)].map(m => {
    const title = m[1].replace(/[`*_]/g, '').trim();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return { title, anchor: `#${slug}` };
  });
}

export function pageSearchKey(page: Pick<DocPage, 'collection' | 'title' | 'url'>): string {
  return `${page.collection}\u0000${page.url}\u0000${page.title}`;
}

export function getBundleSearchIndex(): BundleSearchIndex | undefined {
  return BUNDLE.search;
}

function makePage(args: {
  collection: Collection;
  title: string;
  description: string;
  url: string;
  legacy: boolean;
  body: string;
}): DocPage {
  const headings = (args.body.match(/^#{1,4}\s+(.+)$/gm) ?? []).map(h =>
    h
      .replace(/^#{1,4}\s+/, '')
      .toLowerCase()
      .trim()
  );
  const text = toPlainText(args.body);
  return {
    collection: args.collection,
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
    pages.push(
      makePage({ collection: 'knowledge', title, description: '', url, legacy: false, body })
    );
  }
  return pages;
}

/**
 * Index the toolkit catalog from `public/data/toolkits.json` so the assistant
 * can answer "do you have <toolkit>?" — individual toolkit pages are generated
 * from this data, not from MDX, so they aren't covered by the content scan.
 */
interface Toolkit {
  slug?: string;
  name?: string;
  description?: string;
  category?: string;
  authSchemes?: string[];
}

let toolkitMap: Map<string, Toolkit> | undefined;

/** Parse `public/data/toolkits.json` once into a slug -> toolkit map. */
function getToolkitMap(): Map<string, Toolkit> {
  if (toolkitMap) return toolkitMap;
  const map = new Map<string, Toolkit>();
  if (CONTENT_AVAILABLE) {
    try {
      const parsed = JSON.parse(
        readFileSync(join(APP_ROOT, 'public', 'data', 'toolkits.json'), 'utf8')
      );
      const list: Toolkit[] = Array.isArray(parsed)
        ? parsed
        : (parsed.toolkits ?? parsed.items ?? []);
      for (const tk of list) if (tk?.slug) map.set(tk.slug, tk);
    } catch {
      // no catalog available
    }
  }
  // Deployed runtime (or partial traced catalog): merge in the bundled toolkit
  // snapshot so search/read_doc still cover every generated toolkit page.
  for (const tk of BUNDLE.toolkits) if (tk?.slug && !map.has(tk.slug)) map.set(tk.slug, tk);
  toolkitMap = map;
  return map;
}

function loadBundledToolkits(): DocPage[] {
  const pages: DocPage[] = [];
  for (const tk of BUNDLE.toolkits) {
    if (!tk?.slug) continue;
    const name = tk.name ?? tk.slug;
    const body = `${tk.description ?? ''} Category: ${tk.category ?? ''}. Toolkit slug: ${tk.slug}.`;
    pages.push(
      makePage({
        collection: 'toolkits',
        title: `${name} toolkit`,
        description: tk.description ?? '',
        url: `/toolkits/${tk.slug}`,
        legacy: false,
        body,
      })
    );
  }
  return pages;
}

function loadToolkits(): DocPage[] {
  const pages: DocPage[] = [];
  for (const tk of getToolkitMap().values()) {
    const name = tk.name ?? tk.slug!;
    const body = `${tk.description ?? ''} Category: ${tk.category ?? ''}. Toolkit slug: ${tk.slug}.`;
    pages.push(
      makePage({
        collection: 'toolkits',
        title: `${name} toolkit`,
        description: tk.description ?? '',
        url: `/toolkits/${tk.slug}`,
        legacy: false,
        body,
      })
    );
  }
  return pages;
}

let indexCache: DocPage[] | undefined;

export function buildBundledIndex(): DocPage[] {
  const pages: DocPage[] = [];
  let bundleHasKnowledge = false;
  for (const p of BUNDLE.pages) {
    if (p.collection === 'knowledge') bundleHasKnowledge = true;
    pages.push(
      makePage({
        collection: p.collection,
        title: p.title,
        description: p.description,
        url: p.url,
        legacy: p.legacy || isLegacyUrl(p.url),
        body: p.markdown,
      })
    );
  }
  if (!bundleHasKnowledge) pages.push(...loadKnowledge());
  pages.push(...loadBundledToolkits());
  return pages;
}

export function buildIndex(): DocPage[] {
  if (indexCache) return indexCache;
  const pages: DocPage[] = [];
  if (CONTENT_AVAILABLE) {
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
        pages.push(
          makePage({
            collection: collection as Collection,
            title,
            description,
            url,
            legacy: legacy || isLegacyUrl(url),
            body,
          })
        );
      }
    }
  } else {
    // Deployed runtime: content/ isn't on disk, so index the bundled snapshot.
    pages.push(...buildBundledIndex());
    indexCache = pages;
    return pages;
  }
  pages.push(...loadKnowledge());
  pages.push(...loadToolkits());
  indexCache = pages;
  return pages;
}

/** Resolve a page URL back to its source file and return the raw MDX. */
function authSchemesMarkdown(schemes: string[] = []): string {
  if (!schemes.length) return 'n/a';
  return schemes.map(scheme => `\`${scheme}\``).join(', ');
}

export function readPageByUrl(url: string): { title: string; raw: string } | undefined {
  const clean = url.split('#')[0].split('?')[0].replace(/\/$/, '');
  const parts = clean.split('/').filter(Boolean);
  const collection = parts.shift();
  if (!collection || !COLLECTIONS.includes(collection as (typeof COLLECTIONS)[number]))
    return undefined;

  // Toolkit pages are generated from the catalog, not MDX. Synthesize content
  // so the assistant can confirm support and describe the toolkit.
  if (collection === 'toolkits') {
    const tk = getToolkitMap().get(parts.join('/'));
    if (tk) {
      const name = tk.name ?? tk.slug!;
      const raw = [
        `# ${name}`,
        '',
        tk.description ?? '',
        '',
        `- **Supported:** yes, \`${tk.slug}\` is a Composio toolkit.`,
        `- **Category:** ${tk.category ?? 'n/a'}`,
        `- **Auth:** ${authSchemesMarkdown(tk.authSchemes)}`,
        '',
        `Connect it for a user with \`session.authorize("${tk.slug}")\` (or in-chat auth), then use its tools through the session. See [Configuring sessions](/docs/configuring-sessions), [Authentication](/docs/authentication), and [auth schemes](/reference/api-reference/auth-configs#auth-schemes) for how its auth mode works.`,
      ].join('\n');
      return { title: `${name} toolkit`, raw };
    }
  }

  if (CONTENT_AVAILABLE) {
    const base = join(CONTENT_ROOT, collection, ...parts);
    const candidates = [
      `${base}.mdx`,
      `${base}.md`,
      join(base, 'index.mdx'),
      join(base, 'index.md'),
    ];
    for (const candidate of candidates) {
      try {
        const raw = readFileSync(candidate, 'utf8');
        const { title } = parseFrontmatter(raw);
        return { title: title || url, raw };
      } catch {
        // try next candidate
      }
    }
    // Fall through to the bundled snapshot. Vercel may trace only part of the
    // content tree, while the generated agent snapshot still has the full docs.
  }

  // Deployed runtime: serve the page from the bundled snapshot.
  const page = BUNDLE.pages.find(p => p.url === clean);
  if (page) return { title: page.title || url, raw: page.markdown };
  return undefined;
}
