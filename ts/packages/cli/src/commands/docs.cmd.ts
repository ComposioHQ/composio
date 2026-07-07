import { Args, Command, Options } from '@effect/cli';
import { HttpClient } from '@effect/platform';
import { Config, Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';

const DOCS_BASE_URL = Config.string('DOCS_BASE_URL').pipe(
  Config.withDefault('https://docs.composio.dev')
);

const queryArg = Args.text({ name: 'query' }).pipe(
  Args.withDescription('What to search the docs for, e.g. "webhook signature verification"'),
  Args.repeated
);

const pageOpt = Options.text('page').pipe(
  Options.optional,
  Options.withDescription('Print a docs page as markdown, e.g. --page /docs/triggers')
);

export interface DocsSearchResult {
  title: string;
  description?: string;
  snippet?: string;
  url: string;
  markdown: string;
}

/** Fetch a docs page's markdown twin. Exported for tests. */
export const fetchDocsPage = (pagePathRaw: string) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const baseUrl = yield* DOCS_BASE_URL;
    const pagePath = pagePathRaw.startsWith('/') ? pagePathRaw : `/${pagePathRaw}`;
    const url = `${baseUrl}${pagePath}${pagePath.endsWith('.md') ? '' : '.md'}`;
    const response = yield* httpClient
      .get(url)
      .pipe(Effect.catchAll(error => Effect.fail(new Error(`Failed to fetch ${url}: ${error}`))));
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        new Error(
          `Page not found: ${url} (HTTP ${response.status}). Find the right path first:\n> composio docs "<topic>"`
        )
      );
    }
    return yield* response.text.pipe(
      Effect.catchAll(() => Effect.fail(new Error('Failed to read page body')))
    );
  });

/** Search the docs via the public docs-search endpoint. Exported for tests. */
export const fetchDocsSearch = (q: string) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const baseUrl = yield* DOCS_BASE_URL;
    const searchUrl = `${baseUrl}/api/docs-search?q=${encodeURIComponent(q)}`;
    const response = yield* httpClient
      .get(searchUrl)
      .pipe(Effect.catchAll(error => Effect.fail(new Error(`Docs search failed: ${error}`))));
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(new Error(`Docs search failed (HTTP ${response.status})`));
    }
    const payload = (yield* response.json.pipe(
      Effect.catchAll(() => Effect.fail(new Error('Docs search returned invalid JSON')))
    )) as { results?: DocsSearchResult[] };
    return payload.results ?? [];
  });

/**
 * Search the Composio docs (or print a page) without leaving the terminal.
 * Built for agents: search results go to stdout as JSON with `.md` URLs, and
 * `--page` prints the page's clean markdown — the same content served at
 * `https://docs.composio.dev/<path>.md`.
 */
export const docsCmd = Command.make('docs', { query: queryArg, page: pageOpt }, ({ query, page }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    if (Option.isSome(page)) {
      const body = yield* fetchDocsPage(page.value);
      yield* ui.output(body);
      return;
    }

    const q = query.join(' ').trim();
    if (q.length < 3) {
      yield* ui.log.warn('Give me at least 3 characters to search for.');
      yield* ui.log.step(
        [
          'Examples:',
          '> composio docs "webhook signature verification"',
          '> composio docs triggers dedup',
          '> composio docs --page /docs/quickstart',
        ].join('\n')
      );
      return;
    }

    const results = yield* fetchDocsSearch(q);
    if (results.length === 0) {
      yield* ui.log.warn(
        `No docs matched "${q}". Try different words, or browse composio.dev/llms.txt`
      );
      return;
    }

    for (const result of results) {
      yield* ui.log.info(`${result.title} — ${result.markdown}`);
    }
    yield* ui.log.step('Read a page with:\n> composio docs --page <path from a result url>');
    yield* ui.output(JSON.stringify(results, null, 2));
  })
).pipe(Command.withDescription('Search the Composio docs, or print a docs page as markdown.'));
