import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { buildIndex, tokenize, type DocPage } from '../lib/docs';

/**
 * search_docs — find the most relevant Composio docs pages for a query.
 *
 * Returns each match's title, URL, description, and a snippet. Use it to locate
 * pages, then call `read_doc` on the best matches to read their full content
 * before answering.
 */

// Collection priority: docs first, then examples, then references and toolkits.
// (Curated knowledge ranks with docs.) A toolkit-name query still surfaces its
// toolkit page because nothing else matches it.
const PRIORITY: Record<DocPage['collection'], number> = {
  docs: 1.3,
  knowledge: 1.3,
  examples: 1.1,
  reference: 0.85,
  toolkits: 0.9,
};

function score(page: DocPage, terms: string[]): number {
  const title = page.title.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.includes(term)) total += 12;
    if (page.description.toLowerCase().includes(term)) total += 5;
    for (const heading of page.headings) if (heading.includes(term)) total += 4;
    if (page.url.toLowerCase().includes(term)) total += 6;
    const occurrences = page.lowerText.split(term).length - 1;
    total += Math.min(occurrences, 5);
  }
  // Heavily downrank legacy (direct-execution) pages so they only surface when
  // nothing in the session-based docs matches.
  if (page.legacy) total *= 0.12;
  return total * (PRIORITY[page.collection] ?? 1);
}

function snippet(page: DocPage, terms: string[]): string {
  const lower = page.text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 100);
  const slice = page.text.slice(start, start + 360).trim();
  return (start > 0 ? '…' : '') + slice + (start + 360 < page.text.length ? '…' : '');
}

export default defineTool({
  description:
    'Search the Composio documentation. Returns the most relevant pages with their title, URL, description, and a snippet. Follow up with read_doc on the best matches to read full page content before answering.',
  inputSchema: z.object({
    query: z.string().min(1).describe('What to look for, e.g. "authentication", "create a session", "trigger webhook verification".'),
    limit: z.number().int().min(1).max(12).optional().describe('How many pages to return. Defaults to 8.'),
  }),
  async execute({ query, limit = 8 }) {
    const terms = tokenize(query);
    // Fall back to raw terms if the query was all stopwords.
    const effective = terms.length > 0 ? terms : query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const ranked = buildIndex()
      .map((page) => ({ page, s: score(page, effective) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit);

    return {
      results: ranked.map(({ page }) => ({
        title: page.title,
        url: page.url,
        description: page.description,
        snippet: snippet(page, effective),
      })),
    };
  },
});
