/**
 * Build the docs snapshot the Ask AI agent imports (`agent/lib/docs-index.ts`).
 *
 * The deployed eve service bundles the `agent/` directory but NOT `content/` or
 * `public/data/`, so the agent can't read the docs from disk at runtime. This
 * script snapshots every content page (cleaned Markdown + metadata) and the
 * toolkit catalog into a generated module the agent imports, so eve bundles it
 * into the deployed service. It also precomputes BM25-style lexical term stats
 * for the docs assistant search tool, avoiding cold-start corpus construction in
 * the deployed function.
 *
 * In dev the agent still reads `content/` live when the generated search snapshot
 * does not match; the bundle is always used when the content tree isn't on disk.
 *
 * Self-contained on purpose: it does NOT import `agent/lib/docs.ts` (which
 * imports the generated file), so it can run from a clean checkout where
 * `docs-index.ts` doesn't exist yet. The generated file is gitignored and
 * regenerated before `dev`, `build`, and `types:check`.
 *
 * Run manually with `bun scripts/build-agent-index.ts`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const KNOWLEDGE_FILE = join(ROOT, 'agent', 'knowledge.md');
const COLLECTIONS = ['docs', 'reference', 'examples', 'toolkits'] as const;
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

// The helpers below mirror agent/lib/docs.ts so generated URLs, cleaned
// Markdown, page keys, and BM25 token stats match what the runtime path uses.
function isLegacyUrl(url: string): boolean {
  return LEGACY_URL_PATTERNS.some(p => url === p || url.startsWith(`${p}/`));
}

function urlFromContentPath(absPath: string): string | undefined {
  const rel = relative(CONTENT, absPath).replace(/\\/g, '/');
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

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
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
  return {
    title: get('title'),
    description: get('description'),
    legacy: get('legacy') === 'true',
    body,
  };
}

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

function toCleanMarkdown(raw: string): string {
  const { body } = parseFrontmatter(raw);
  return body
    .replace(/<\/?[A-Za-z][A-Za-z0-9.]*(\s[^>]*)?\/?>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface BundlePage {
  collection: string;
  url: string;
  title: string;
  description: string;
  legacy: boolean;
  markdown: string;
}

interface BundleToolkit {
  slug: string;
  name?: string;
  description?: string;
  category?: string;
  authSchemes?: string[];
}

interface SearchPage {
  collection: string;
  title: string;
  description: string;
  url: string;
  headings: string[];
  lowerText: string;
}

function pageSearchKey(page: Pick<SearchPage, 'collection' | 'title' | 'url'>): string {
  return `${page.collection}\u0000${page.url}\u0000${page.title}`;
}

function makeSearchPage(args: {
  collection: string;
  title: string;
  description: string;
  url: string;
  body: string;
}): SearchPage {
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
    headings,
    lowerText: `${args.title} ${args.description} ${text}`.toLowerCase(),
  };
}

function loadKnowledgePages(): BundlePage[] {
  if (!existsSync(KNOWLEDGE_FILE)) return [];

  const raw = readFileSync(KNOWLEDGE_FILE, 'utf8');
  const pages: BundlePage[] = [];
  const sectionRe = /^##\s+(.+?)\s*(?:\(([^)]+)\))?\s*$/gm;
  const matches = [...raw.matchAll(sectionRe)];

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const title = match[1].trim();
    const url = (match[2] ?? '').trim() || '/docs';
    const bodyStart = match.index! + match[0].length;
    const bodyEnd = index + 1 < matches.length ? matches[index + 1].index! : raw.length;
    const body = raw.slice(bodyStart, bodyEnd).trim();

    pages.push({
      collection: 'knowledge',
      url,
      title,
      description: '',
      legacy: false,
      markdown: body,
    });
  }

  return pages;
}

function searchPageForToolkit(tk: BundleToolkit): SearchPage {
  const name = tk.name ?? tk.slug;
  const body = `${tk.description ?? ''} Category: ${tk.category ?? ''}. Toolkit slug: ${tk.slug}.`;

  return makeSearchPage({
    collection: 'toolkits',
    title: `${name} toolkit`,
    description: tk.description ?? '',
    url: `/toolkits/${tk.slug}`,
    body,
  });
}

function termCountsFor(page: SearchPage): Map<string, number> {
  const counts = new Map<string, number>();

  for (const token of tokenize(page.lowerText)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

function buildSearchIndex(searchPages: SearchPage[]) {
  const entries = searchPages.map(page => {
    const counts = termCountsFor(page);
    const terms = [...counts.entries()];

    return {
      key: pageSearchKey(page),
      terms,
      length: terms.reduce((sum, [, count]) => sum + count, 0),
    };
  });
  const documentFrequency = new Map<string, number>();

  for (const entry of entries) {
    for (const [term] of entry.terms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return {
    averageLength:
      entries.reduce((sum, entry) => sum + entry.length, 0) / Math.max(entries.length, 1),
    documentFrequency: [...documentFrequency.entries()],
    entries,
  };
}

const pages: BundlePage[] = [];
for (const collection of COLLECTIONS) {
  const dir = join(CONTENT, collection);
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
    const raw = readFileSync(absPath, 'utf8');
    const { title, description, legacy } = parseFrontmatter(raw);
    pages.push({
      collection,
      url,
      title: title || url,
      description,
      legacy: legacy || isLegacyUrl(url),
      markdown: toCleanMarkdown(raw),
    });
  }
}

let toolkits: BundleToolkit[] = [];
try {
  const parsed = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'toolkits.json'), 'utf8'));
  const list = Array.isArray(parsed) ? parsed : (parsed.toolkits ?? parsed.items ?? []);
  toolkits = list
    .filter((tk: { slug?: string }) => Boolean(tk?.slug))
    .map((tk: BundleToolkit) => ({
      slug: tk.slug,
      name: tk.name,
      description: tk.description,
      category: tk.category,
      authSchemes: tk.authSchemes,
    }));
} catch {
  // no catalog available
}

const contentSearchPages = pages.map(page =>
  makeSearchPage({
    collection: page.collection,
    title: page.title,
    description: page.description,
    url: page.url,
    body: page.markdown,
  })
);
const knowledgePages = loadKnowledgePages();
pages.push(...knowledgePages);
const knowledgeSearchPages = knowledgePages.map(page =>
  makeSearchPage({
    collection: page.collection,
    title: page.title,
    description: page.description,
    url: page.url,
    body: page.markdown,
  })
);
const toolkitSearchPages = toolkits.map(searchPageForToolkit);
const search = buildSearchIndex([
  ...contentSearchPages,
  ...knowledgeSearchPages,
  ...toolkitSearchPages,
]);

// Emit a .ts module (not .json): eve's discovery scans agent/lib/ and only
// accepts authored modules there, so a raw .json fails `eve build`. We embed the
// snapshot as a JSON string parsed at runtime — a plain string literal keeps the
// source fast for tsc and free of escaping pitfalls, and lets eve bundle it.
const json = JSON.stringify({ pages, toolkits, search });
const ts =
  `/* eslint-disable */\n` +
  `// Auto-generated by scripts/build-agent-index.ts — do not edit by hand.\n` +
  `// Gitignored snapshot of content/ + the toolkit catalog, imported by\n` +
  `// lib/docs.ts so eve bundles it into the deployed service (agent/ but not content/).\n` +
  `export default JSON.parse(\n  ${JSON.stringify(json)},\n) as unknown;\n`;
const out = join(ROOT, 'agent', 'lib', 'docs-index.ts');
writeFileSync(out, ts);
console.log(
  `[build-agent-index] wrote ${pages.length} pages + ${toolkits.length} toolkits + ${search.entries.length} BM25 rows (${Math.round(json.length / 1024)} KB) -> ${out}`
);
