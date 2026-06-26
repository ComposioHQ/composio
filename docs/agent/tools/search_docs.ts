import { defineTool } from 'eve/tools';
import { z } from 'zod';
import {
  buildIndex,
  extractSections,
  readPageByUrl,
  toCleanMarkdown,
  tokenize,
  type DocPage,
} from '../lib/docs';

/**
 * search_docs — find the most relevant Composio docs pages for a query.
 *
 * Returns each match's title, URL, description, and a snippet. The top matches
 * also include compact page excerpts so the agent can often answer after one
 * tool call instead of doing a separate search_docs -> read_doc round trip.
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

const DEFAULT_LIMIT = 5;
const MAX_EVIDENCE_RESULTS = 3;
const EVIDENCE_CHARS = 1_800;
const MAX_SECTIONS = 12;

function countOccurrences(text: string, term: string, max = 5): number {
  let count = 0;
  let from = 0;

  while (count < max) {
    const at = text.indexOf(term, from);
    if (at === -1) break;
    count += 1;
    from = at + term.length;
  }

  return count;
}

function score(page: DocPage, terms: string[]): number {
  const title = page.title.toLowerCase();
  const description = page.description.toLowerCase();
  const url = page.url.toLowerCase();
  let total = 0;

  for (const term of terms) {
    if (title.includes(term)) total += 12;
    if (description.includes(term)) total += 5;
    for (const heading of page.headings) if (heading.includes(term)) total += 4;
    if (url.includes(term)) total += 6;
    total += countOccurrences(page.lowerText, term);
  }

  // Heavily downrank legacy (direct-execution) pages so they only surface when
  // nothing in the session-based docs matches.
  if (page.legacy) total *= 0.12;
  return total * (PRIORITY[page.collection] ?? 1);
}

function firstTermMatch(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return (
    terms
      .map(term => lower.indexOf(term))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0] ?? 0
  );
}

function excerpt(
  text: string,
  terms: string[],
  maxChars: number
): { value: string; truncated: boolean } {
  const at = firstTermMatch(text, terms);
  const start = Math.max(0, at - 180);
  const end = Math.min(text.length, start + maxChars);
  const slice = text.slice(start, end).trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';

  return { value: `${prefix}${slice}${suffix}`, truncated: start > 0 || end < text.length };
}

function snippet(page: DocPage, terms: string[]): string {
  return excerpt(page.text, terms, 360).value;
}

function evidenceFor(page: DocPage, terms: string[]) {
  const found = readPageByUrl(page.url);

  if (found) {
    const markdown = toCleanMarkdown(found.raw);
    const evidence = excerpt(markdown, terms, EVIDENCE_CHARS);

    return {
      sections: extractSections(markdown).slice(0, MAX_SECTIONS),
      content: evidence.value,
      contentTruncated: evidence.truncated,
    };
  }

  const evidence = excerpt(page.text, terms, EVIDENCE_CHARS);
  return {
    content: evidence.value,
    contentTruncated: evidence.truncated,
  };
}

export default defineTool({
  description:
    'Search the Composio documentation. Returns relevant pages with title, URL, description, snippet, and compact content excerpts for the top matches. Answer from those excerpts when sufficient; call read_doc only when you need the full page.',
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        'What to look for, e.g. "authentication", "create a session", "trigger webhook verification".'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe('How many pages to return. Defaults to 5.'),
  }),
  async execute({ query, limit = DEFAULT_LIMIT }) {
    const terms = tokenize(query);
    // Fall back to raw terms if the query was all stopwords.
    const effective =
      terms.length > 0
        ? terms
        : query
            .toLowerCase()
            .split(/\s+/)
            .filter(t => t.length > 1);
    const ranked = buildIndex()
      .map(page => ({ page, s: score(page, effective) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit);

    return {
      results: ranked.map(({ page }, index) => ({
        title: page.title,
        url: page.url,
        description: page.description,
        snippet: snippet(page, effective),
        ...(index < MAX_EVIDENCE_RESULTS ? evidenceFor(page, effective) : {}),
      })),
    };
  },
});
