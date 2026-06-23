import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { readPageByUrl, toCleanMarkdown } from '../lib/docs';

/**
 * read_doc — read the full content of a Composio docs page.
 *
 * Pass a URL from search_docs (or the concept map) and get the page's cleaned
 * Markdown so you can answer from real content instead of a snippet.
 */

const MAX_CHARS = 12000;

export default defineTool({
  description:
    'Read the full Markdown content of a Composio docs page by its URL (e.g. "/docs/authentication"). Use this on the most relevant pages from search_docs before answering so your answer reflects the actual page content.',
  inputSchema: z.object({
    url: z.string().min(1).describe('The page URL, e.g. "/docs/authentication" or "/docs/configuring-sessions".'),
  }),
  async execute({ url }) {
    const page = readPageByUrl(url);
    if (!page) {
      return { found: false, url, message: `No docs page found for "${url}". Use search_docs to find a valid URL.` };
    }
    const markdown = toCleanMarkdown(page.raw);
    const truncated = markdown.length > MAX_CHARS;
    return {
      found: true,
      url: url.split('#')[0],
      title: page.title,
      truncated,
      content: truncated ? `${markdown.slice(0, MAX_CHARS)}\n\n…(truncated)` : markdown,
    };
  },
});
