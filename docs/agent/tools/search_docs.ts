import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * search_docs — the agent's window into the Composio documentation.
 *
 * Builds a lazy in-memory index over `content/` (docs, reference, examples,
 * toolkits), scores pages against the query, and returns each match's title,
 * URL, and a snippet. The agent links the returned URLs so answers cite
 * specific pages.
 */

interface DocPage {
  title: string;
  description: string;
  url: string;
  /** Lowercased plain-text body used for scoring and snippets. */
  text: string;
}

const CONTENT_ROOT = join(process.cwd(), 'content');
const COLLECTIONS = ['docs', 'reference', 'examples', 'toolkits'] as const;

/** Mirror of lib/search-index.ts `urlFromContentPath` so links match real routes. */
function urlFromContentPath(absPath: string): string | undefined {
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

function parseFrontmatter(raw: string): { title: string; description: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { title: '', description: '', body: raw };
  const [, fm, body] = match;
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  return { title: get('title'), description: get('description'), body };
}

/** Strip MDX/JSX/markdown noise down to readable plain text for scoring. */
function toPlainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ') // JSX/HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let indexCache: DocPage[] | undefined;

function buildIndex(): DocPage[] {
  if (indexCache) return indexCache;
  const pages: DocPage[] = [];
  for (const collection of COLLECTIONS) {
    const dir = join(CONTENT_ROOT, collection);
    let entries: string[];
    try {
      entries = readdirSync(dir, { recursive: true }) as string[];
    } catch {
      continue; // collection may not exist
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
      const { title, description, body } = parseFrontmatter(raw);
      pages.push({
        title: title || url,
        description,
        url,
        text: `${title} ${description} ${toPlainText(body)}`.toLowerCase(),
      });
    }
  }
  indexCache = pages;
  return pages;
}

function score(page: DocPage, terms: string[]): number {
  const title = page.title.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (!term) continue;
    if (title.includes(term)) total += 10; // title matches weigh heaviest
    const occurrences = page.text.split(term).length - 1;
    total += Math.min(occurrences, 8);
  }
  return total;
}

function snippet(page: DocPage, terms: string[]): string {
  const first = terms.find((t) => t && page.text.includes(t));
  const at = first ? page.text.indexOf(first) : 0;
  const start = Math.max(0, at - 120);
  return page.text.slice(start, start + 280).trim();
}

export default defineTool({
  description:
    'Search the Composio documentation. Returns the most relevant pages with their title, URL, and a snippet so you can cite and link specific pages.',
  inputSchema: z.object({
    query: z.string().min(1).describe('What to look for, e.g. "create a session" or "trigger webhook verification".'),
    limit: z.number().int().min(1).max(10).optional().describe('How many pages to return. Defaults to 6.'),
  }),
  async execute({ query, limit = 6 }) {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const ranked = buildIndex()
      .map((page) => ({ page, score: score(page, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      results: ranked.map(({ page }) => ({
        title: page.title,
        url: page.url,
        description: page.description,
        snippet: snippet(page, terms),
      })),
    };
  },
});
