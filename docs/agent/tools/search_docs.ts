import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { DEFAULT_SEARCH_LIMIT, searchDocs } from '../lib/docs-search';

/**
 * search_docs — find the most relevant Composio docs pages for a query.
 *
 * This is a local, in-memory lexical retriever. It uses a BM25-style body score
 * plus field boosts for title, description, headings, and URL. The top results
 * include full page content (bounded per page), so the model gets rich context
 * in the same fast tool call instead of doing a serial search -> read round trip.
 */

export default defineTool({
  description:
    'Search the Composio documentation with a fast BM25-style local retriever. Returns relevant pages and includes full bounded content for the top matches, so you can answer from the returned context. Call read_doc only if you need a page beyond the included content.',
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
  async execute({ query, limit = DEFAULT_SEARCH_LIMIT }) {
    return searchDocs(query, { limit, invocation: 'tool' });
  },
});
