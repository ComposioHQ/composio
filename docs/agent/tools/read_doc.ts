import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { buildIndex, extractSections, readPageByUrl, toCleanMarkdown } from '../lib/docs';

/**
 * read_doc — read the full content of a Composio docs page.
 *
 * Pass a URL from search_docs (or the concept map) and get the page's cleaned
 * Markdown so you can answer from real content instead of a snippet.
 */

const MAX_CHARS = 12000;

export default defineTool({
  description:
    'Read the full Markdown content of a Composio docs page by its URL (e.g. "/docs/authentication"). Returns the page content plus its `sections` (with anchors). Use this on the most relevant pages from search_docs before answering, and link the specific section anchor (e.g. /docs/how-composio-works#users) when your answer comes from one.',
  inputSchema: z.object({
    url: z.string().min(1).describe('The page URL, e.g. "/docs/authentication" or "/docs/configuring-sessions".'),
  }),
  async execute({ url }) {
    const clean = url.split('#')[0].split('?')[0].replace(/\/$/, '');
    const page = readPageByUrl(url);
    if (page) {
      const markdown = toCleanMarkdown(page.raw);
      const truncated = markdown.length > MAX_CHARS;
      return {
        found: true,
        url: clean,
        title: page.title,
        sections: extractSections(markdown),
        truncated,
        content: truncated ? `${markdown.slice(0, MAX_CHARS)}\n\n…(truncated)` : markdown,
      };
    }
    // Fallback: the page may be indexed even if its source file can't be read
    // directly (e.g. a different runtime layout). Return the indexed text.
    const indexed = buildIndex().find((p) => p.url === clean);
    if (indexed && indexed.text) {
      const truncated = indexed.text.length > MAX_CHARS;
      return {
        found: true,
        url: clean,
        title: indexed.title,
        truncated,
        content: truncated ? `${indexed.text.slice(0, MAX_CHARS)}\n\n…(truncated)` : indexed.text,
      };
    }
    return { found: false, url, message: `No docs page found for "${url}". Use search_docs to find a valid URL.` };
  },
});
