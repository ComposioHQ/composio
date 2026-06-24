/**
 * Build the docs snapshot the Ask AI agent imports (`agent/lib/docs-index.json`).
 *
 * The deployed eve service bundles the `agent/` directory but NOT `content/` or
 * `public/data/`, so the agent can't read the docs from disk at runtime. This
 * script snapshots every content page (cleaned Markdown + metadata) and the
 * toolkit catalog into a JSON the agent imports, so eve bundles it into the
 * deployed service. In dev the agent still reads `content/` live; the bundle is
 * only used when the content tree isn't on disk.
 *
 * Runs automatically before `dev` and `build`; run manually with
 * `bun scripts/build-agent-index.ts`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  urlFromContentPath,
  toCleanMarkdown,
  parseFrontmatter,
  isLegacyUrl,
} from '../agent/lib/docs';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const COLLECTIONS = ['docs', 'reference', 'examples', 'toolkits'] as const;

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

const out = join(ROOT, 'agent', 'lib', 'docs-index.json');
writeFileSync(out, JSON.stringify({ pages, toolkits }));
const kb = Math.round(JSON.stringify({ pages, toolkits }).length / 1024);
console.log(`[build-agent-index] wrote ${pages.length} pages + ${toolkits.length} toolkits (${kb} KB) -> ${out}`);
