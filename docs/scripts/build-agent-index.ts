/**
 * Build the docs snapshot the Ask AI agent imports (`agent/lib/docs-index.ts`).
 *
 * The deployed eve service bundles the `agent/` directory but NOT `content/` or
 * `public/data/`, so the agent can't read the docs from disk at runtime. This
 * script snapshots every content page (cleaned Markdown + metadata) and the
 * toolkit catalog into a generated module the agent imports, so eve bundles it
 * into the deployed service. In dev the agent still reads `content/` live; the
 * bundle is only used when the content tree isn't on disk.
 *
 * Self-contained on purpose: it does NOT import `agent/lib/docs.ts` (which
 * imports the generated file), so it can run from a clean checkout where
 * `docs-index.ts` doesn't exist yet. The generated file is gitignored and
 * regenerated before `dev`, `build`, and `types:check`.
 *
 * Run manually with `bun scripts/build-agent-index.ts`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const COLLECTIONS = ['docs', 'reference', 'examples', 'toolkits'] as const;
const LEGACY_URL_PATTERNS = [
  '/docs/tools-direct',
  '/docs/auth-configuration',
  '/docs/sessions-vs-direct-execution',
];

// The helpers below mirror agent/lib/docs.ts so generated URLs and cleaned
// Markdown match what the live (filesystem) path produces. Keep them in sync.
function isLegacyUrl(url: string): boolean {
  return LEGACY_URL_PATTERNS.some((p) => url === p || url.startsWith(`${p}/`));
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

function parseFrontmatter(raw: string): { title: string; description: string; legacy: boolean; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { title: '', description: '', legacy: false, body: raw };
  const [, fm, body] = match;
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  return { title: get('title'), description: get('description'), legacy: get('legacy') === 'true', body };
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

interface BundleToolkit {
  slug: string;
  name?: string;
  description?: string;
  category?: string;
  authSchemes?: string[];
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

// Emit a .ts module (not .json): eve's discovery scans agent/lib/ and only
// accepts authored modules there, so a raw .json fails `eve build`. We embed the
// snapshot as a JSON string parsed at runtime — a plain string literal keeps the
// source fast for tsc and free of escaping pitfalls, and lets eve bundle it.
const json = JSON.stringify({ pages, toolkits });
const ts =
  `/* eslint-disable */\n` +
  `// Auto-generated by scripts/build-agent-index.ts — do not edit by hand.\n` +
  `// Gitignored snapshot of content/ + the toolkit catalog, imported by\n` +
  `// lib/docs.ts so eve bundles it into the deployed service (agent/ but not content/).\n` +
  `export default JSON.parse(\n  ${JSON.stringify(json)},\n) as unknown;\n`;
const out = join(ROOT, 'agent', 'lib', 'docs-index.ts');
writeFileSync(out, ts);
console.log(`[build-agent-index] wrote ${pages.length} pages + ${toolkits.length} toolkits (${Math.round(json.length / 1024)} KB) -> ${out}`);
