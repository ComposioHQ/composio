import type { UserContent } from 'ai';
import { none } from 'eve/channels/auth';
import { defaultEveAuth, eveChannel } from 'eve/channels/eve';
import { DEFAULT_SEARCH_LIMIT, searchDocs, type SearchDocsResult } from '../lib/docs-search';

/**
 * HTTP channel for the docs assistant.
 *
 * The docs are public and any visitor can open the chat, so the session routes
 * are unauthenticated (`none()`). This intentionally exposes the agent endpoint
 * publicly; before production we should add rate limiting and abuse protection
 * (or gate it behind the site's own auth).
 */

const EAGER_SEARCH_ENABLED = process.env.DOCS_AGENT_EAGER_SEARCH !== '0';
const EAGER_SEARCH_LIMIT = DEFAULT_SEARCH_LIMIT;
const MAX_CONTEXT_SECTIONS = 8;

function messageToText(message: string | UserContent): string {
  if (typeof message === 'string') return message;

  return message
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

function isClearlyAccountSpecificRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  const accountTerms = /\b(account|billing|invoice|payment|refund|subscription|ticket|dashboard|workspace|organization|org|api key)\b/;
  const personalTerms = /\b(my|our|me|us|latest|current|status|paid|check|look up|lookup|change|cancel|delete|update)\b/;

  return accountTerms.test(normalized) && personalTerms.test(normalized);
}

function shouldEagerSearch(text: string): boolean {
  if (!EAGER_SEARCH_ENABLED) return false;
  if (text.trim().length < 3) return false;
  if (isClearlyAccountSpecificRequest(text)) return false;
  return true;
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
    const result = searchDocs(text, { limit: EAGER_SEARCH_LIMIT, invocation: 'eager_context' });
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
