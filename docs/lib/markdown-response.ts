import { detectReferenceApiVersion } from './api-version';
import { resolveDocsProduct } from './home-navigation';

const DOCS_ORIGIN = 'https://docs.composio.dev';

/** JSON scalars are also YAML scalars, so URLs and strings remain safely quoted. */
export function withMarkdownMetadata(
  body: string,
  pathname: string,
  lastUpdated: string | null,
  init?: ResponseInit,
): Response {
  const canonicalUrl = new URL(pathname, DOCS_ORIGIN).href;
  const metadata = {
    canonical_url: canonicalUrl,
    markdown_url: `${canonicalUrl}.md`,
    product: resolveDocsProduct(pathname),
    version: detectReferenceApiVersion(pathname),
    last_updated: lastUpdated,
  };
  const frontmatter = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'text/markdown; charset=utf-8');
  const vary = headers.get('Vary');
  if (!vary?.split(',').some(value => ['accept', '*'].includes(value.trim().toLowerCase()))) {
    headers.set('Vary', vary ? `${vary}, Accept` : 'Accept');
  }
  return new Response(`---\n${frontmatter}\n---\n\n${body}`, { ...init, headers });
}

export function missingMarkdownResponse(): Response {
  return new Response(
    '# Page not found\n\nThis documentation page does not exist. Check the URL or use these discovery links:\n\n' +
    '- [Documentation index](/llms.txt)\n' +
    '- [Complete page index](/llms-index.txt)\n' +
    '- [Search support knowledge](/kb/search)\n' +
    '- [Quickstart](/docs/quickstart.md)\n',
    { status: 404, headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
  );
}
