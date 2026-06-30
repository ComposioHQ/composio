import type { UserContent } from 'ai';
import { none } from 'eve/channels/auth';
import { defaultEveAuth, eveChannel } from 'eve/channels/eve';
import { searchDocs, shouldRunEagerDocsSearch, type SearchDocsResult } from '../lib/docs-search';

/**
 * HTTP channel for the docs assistant.
 *
 * The docs are public and any visitor can open the chat, so the session routes
 * are unauthenticated (`none()`). This intentionally exposes the agent endpoint
 * publicly; before production we should add rate limiting and abuse protection
 * (or gate it behind the site's own auth).
 */

const EAGER_SEARCH_LIMIT = 3;
const EAGER_CONTENT_RESULTS = 2;
const EAGER_MAX_CONTENT_CHARS = 6000;
const EAGER_MAX_SECTIONS = 6;
const MAX_CONTEXT_SECTIONS = EAGER_MAX_SECTIONS;

function messageToText(message: string | UserContent): string {
  if (typeof message === 'string') return message;

  return message
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

function shouldEagerSearch(text: string): boolean {
  return shouldRunEagerDocsSearch(text);
}

function formatSections(result: SearchDocsResult['results'][number]): string {
  const sections = result.sections?.slice(0, MAX_CONTEXT_SECTIONS) ?? [];
  if (sections.length === 0) return '';

  return sections.map(section => `[${section.title}](${result.url}${section.anchor})`).join(', ');
}

function formatEagerSearchContext(result: SearchDocsResult): string | undefined {
  if (result.results.length === 0) return undefined;

  const docs = result.results
    .map((page, index) => {
      const sections = formatSections(page);
      const content = page.content
        ? `${page.content}${page.contentTruncated ? '\n\n…(content truncated)' : ''}`
        : page.snippet;

      return [
        `### ${index + 1}. ${page.title}`,
        `URL: ${page.url}`,
        page.description ? `Description: ${page.description}` : undefined,
        sections ? `Sections: ${sections}` : undefined,
        'Content:',
        content,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');

  return `Eager Composio docs search context for the user's latest message.

Use this context when it answers the question. You may still call \`search_docs\` or \`read_doc\` if this context is weak, missing, ambiguous, or you need more detail. Cite only the included docs URLs/section anchors.

<docs_search_context retrieval="${result.retrieval}">
${docs}
</docs_search_context>`;
}

function buildEagerSearchContext(message: string | UserContent): string[] | undefined {
  const text = messageToText(message);
  if (!shouldEagerSearch(text)) return undefined;

  try {
    const result = searchDocs(text, {
      limit: EAGER_SEARCH_LIMIT,
      contentResultCount: EAGER_CONTENT_RESULTS,
      maxContentChars: EAGER_MAX_CONTENT_CHARS,
      maxSections: EAGER_MAX_SECTIONS,
      invocation: 'eager_context',
    });
    const context = formatEagerSearchContext(result);
    return context ? [context] : undefined;
  } catch (error) {
    console.warn('[docs-agent:eager_search] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export default eveChannel({
  auth: [none()],
  onMessage(ctx, message) {
    const auth = defaultEveAuth(ctx);
    const context = buildEagerSearchContext(message);
    return context ? { auth, context } : { auth };
  },
});
