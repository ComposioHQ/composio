import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { checkApolloContract, renderReport } from '../../scripts/apollo-contract';

const config = {
  COMPOSIO_BASE_URL: 'https://staging-backend.composio.dev',
  COMPOSIO_API_KEY: 'test-project-key',
  COMPOSIO_USER_API_KEY: 'test-user-key',
};

describe('Apollo contract check', () => {
  it.effect.each([401, 403, 429])('stops after HTTP %s without retrying', status =>
    Effect.gen(function* () {
      const requests: string[] = [];
      const client = HttpClient.make(request => {
        requests.push(request.url);
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify({ error: { message: 'rejected' } }), { status })
          )
        );
      });
      const result = yield* checkApolloContract.pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(config))
      );
      expect(requests).toHaveLength(1);
      expect(result.results).toHaveLength(10);
      expect(result.results[0]?.outcome).toMatchObject({
        status: 'fail',
        detail: expect.stringContaining(`HTTP ${status}:`),
      });
      expect(result.results[0]?.outcome.detail).toContain('rejected');
      expect(result.results.slice(1).every(result => result.outcome.status === 'not run')).toBe(
        true
      );
    })
  );

  it.effect('reports schema paths and continues using the correct credentials', () =>
    Effect.gen(function* () {
      const requests: Array<{ url: string; headers: Readonly<Record<string, string>> }> = [];
      const client = HttpClient.make(request => {
        requests.push({ url: request.url, headers: request.headers });
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({})));
      });
      const result = yield* checkApolloContract.pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(config))
      );
      expect(requests).toHaveLength(10);
      expect(result.results.every(result => result.outcome.status === 'fail')).toBe(true);
      expect(result.results[0]?.outcome.detail).toContain('schema mismatch: items:');
      expect(
        requests
          .slice(0, 8)
          .every(request => request.headers['x-api-key'] === config.COMPOSIO_API_KEY)
      ).toBe(true);
      expect(
        requests
          .slice(8)
          .every(request => request.headers['x-user-api-key'] === config.COMPOSIO_USER_API_KEY)
      ).toBe(true);
    })
  );

  it.effect('reports an empty organization list as a failed project check', () =>
    Effect.gen(function* () {
      const client = HttpClient.make(request =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              request.url.includes('/org/list')
                ? { organizations: [], total_pages: 1, current_page: 1, total_items: 0 }
                : {}
            )
          )
        )
      );
      const result = yield* checkApolloContract.pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(config))
      );
      expect(result.results[8]?.outcome.status).toBe('pass');
      expect(result.results[9]?.outcome).toMatchObject({
        status: 'fail',
        detail: 'the user key belongs to no organization',
      });
      expect(renderReport(result)).toContain('1/10 cases passed');
    })
  );

  it.effect('keeps hostile error text inside its report cell', () =>
    Effect.gen(function* () {
      const message =
        'boom\r| forged | pass |\n<img src=x> [click](https://evil.test) `code` \\| **bold** &amp;';
      const client = HttpClient.make(request =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({ error: { message } }, { status: 401 })
          )
        )
      );
      const result = yield* checkApolloContract.pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(config))
      );
      const report = renderReport(result);
      expect(report).not.toContain('\r');
      expect(report).not.toContain('<img');
      expect(report).not.toContain('[click]');
      expect(report).not.toContain('`code`');
      expect(report).not.toContain('**bold**');
      const rows = report.split('\n').filter(line => line.startsWith('|'));
      expect(rows).toHaveLength(12);
      expect(rows.every(row => row.split('|').length === 5)).toBe(true);
      expect(report).toContain('&#124; forged &#124; pass &#124;');
      expect(report).toContain('&#38;amp;');
    })
  );

  it.effect.each([
    { ...config, COMPOSIO_BASE_URL: 'https://untrusted.example' },
    { ...config, COMPOSIO_API_KEY: '' },
    { ...config, COMPOSIO_USER_API_KEY: undefined },
  ])('rejects invalid configuration before sending credentials', env =>
    Effect.gen(function* () {
      let requests = 0;
      const client = HttpClient.make(request => {
        requests++;
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({})));
      });
      const error = yield* checkApolloContract.pipe(
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env)),
        Effect.flip
      );
      expect(error).toBeDefined();
      expect(requests).toBe(0);
    })
  );
});
