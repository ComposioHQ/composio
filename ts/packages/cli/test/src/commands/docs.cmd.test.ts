import { describe, expect, it, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { cli, MockConsole, TestLive, withHttpServer } from 'test/__utils__';
import { fetchDocsPage, fetchDocsSearch } from 'src/commands/docs.cmd';

const SEARCH_RESULTS = [
  {
    title: 'Receiving events',
    description: 'Stand up the endpoint that receives trigger events.',
    snippet: 'Once a trigger is created...',
    url: 'https://docs.composio.dev/docs/triggers/receiving-events',
    markdown: 'https://docs.composio.dev/docs/triggers/receiving-events.md',
  },
];

const PAGE_BODY = '# Receiving events (/docs/triggers/receiving-events)\n\ncontent';

const withDocsConfig = <A, E>(effect: Effect.Effect<A, E, never>, baseUrl: string) =>
  effect.pipe(
    Effect.withConfigProvider(ConfigProvider.fromMap(new Map([['DOCS_BASE_URL', baseUrl]])))
  );

const docsSiteHandler = (req: { url?: string }, res: any) => {
  if (req.url?.startsWith('/api/docs-search')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ results: SEARCH_RESULTS }));
    return;
  }
  if (req.url === '/docs/triggers/receiving-events.md') {
    res.setHeader('content-type', 'text/markdown');
    res.end(PAGE_BODY);
    return;
  }
  res.statusCode = 404;
  res.end('not found');
};

describe('composio docs: fetch effects', () => {
  it('[When] searching [Then] returns matches with .md URLs', async () => {
    await withHttpServer(docsSiteHandler, async baseUrl => {
      const results = await Effect.runPromise(
        withDocsConfig(
          fetchDocsSearch('trigger webhook dedup').pipe(
            Effect.provide(FetchHttpClient.layer),
            Effect.scoped
          ),
          baseUrl
        )
      );
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Receiving events');
      expect(results[0].markdown).toContain('/docs/triggers/receiving-events.md');
    });
  });

  it('[When] fetching a page [Then] returns its markdown (with and without .md suffix)', async () => {
    await withHttpServer(docsSiteHandler, async baseUrl => {
      for (const path of ['/docs/triggers/receiving-events', 'docs/triggers/receiving-events.md']) {
        const body = await Effect.runPromise(
          withDocsConfig(
            fetchDocsPage(path).pipe(Effect.provide(FetchHttpClient.layer), Effect.scoped),
            baseUrl
          )
        );
        expect(body).toContain('# Receiving events');
      }
    });
  });

  it('[When] the page does not exist [Then] fails with a search hint', async () => {
    await withHttpServer(docsSiteHandler, async baseUrl => {
      const error = await Effect.runPromise(
        withDocsConfig(
          fetchDocsPage('/docs/nope').pipe(
            Effect.provide(FetchHttpClient.layer),
            Effect.scoped,
            Effect.flip
          ),
          baseUrl
        )
      );
      expect(error.message).toContain('HTTP 404');
      expect(error.message).toContain('composio docs');
    });
  });
});

describe('CLI: composio docs', () => {
  layer(TestLive())('[Given] a too-short query', it => {
    it.scoped('[Then] shows usage examples instead of searching', () =>
      Effect.gen(function* () {
        yield* cli(['docs', 'ab']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('at least 3 characters');
        expect(output).toContain('composio docs --page');
      })
    );
  });
});
