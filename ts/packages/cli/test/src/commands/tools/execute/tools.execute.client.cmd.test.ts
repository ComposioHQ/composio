import { describe, expect, layer } from '@effect/vitest';
import { beforeEach, vi } from 'vitest';
import { ConfigProvider, Effect, Exit } from 'effect';
import { CLI_ANALYTICS_EVENTS } from 'src/analytics/events';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { stubComposioClient } from 'test/__utils__/services/stub-composio-client';
import { eventsNamed, trackedEvents } from 'test/__utils__/tracked-events';

vi.mock('src/analytics/dispatch', async importOriginal => {
  const { recordTrackedEvent } = await import('test/__utils__/tracked-events');
  return {
    ...(await importOriginal<typeof import('src/analytics/dispatch')>()),
    trackCliEventEffect: recordTrackedEvent,
  };
});

// Disable CI redaction so tests see raw values; `src/ui/redact` reads `CI` once
// at import time.
vi.hoisted(() => {
  delete process.env.CI;
});

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const executeArgs = ['execute', 'GITHUB_STAR_REPO', '-d', '{"owner":"composio","repo":"composio"}'];

/**
 * A test layer whose Tool Router execution goes through the real client, with
 * the request options the executor chose, to a transport answering `respond`.
 */
const executingOver = (respond: () => Response) => {
  const stub = stubComposioClient(respond);
  const testLayer = TestLive({
    baseConfigProvider: testConfigProvider,
    fixture: 'global-test-user-id',
    stdin: { isTTY: true, data: '' },
    toolRouter: {
      execute: (sessionId, params, options) =>
        stub.client.toolRouter.session.execute(sessionId, params, options),
    },
  });
  return { requests: stub.requests, testLayer };
};

describe('CLI: composio execute over the API client', () => {
  beforeEach(() => {
    trackedEvents.length = 0;
  });

  const rejected = executingOver(() =>
    Response.json(
      {
        error: {
          message: 'The upstream app refused the request',
          code: 4310,
          slug: 'ToolRouterV2_UpstreamRefused',
          status: 400,
        },
      },
      { status: 400, headers: { 'x-request-id': 'req_refused' } }
    )
  );
  layer(rejected.testLayer)('[Given] the API rejects the execution with an error envelope', it => {
    it.effect('[Then] the failure is printed and tracked with its status, code and slug', () =>
      Effect.gen(function* () {
        const exit = yield* cli(executeArgs).pipe(Effect.exit);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(Exit.isFailure(exit)).toBe(true);
        expect(output).toContain('The upstream app refused the request');
        expect(output).toContain('Error details');
        expect(eventsNamed(CLI_ANALYTICS_EVENTS.CLI_TOOL_INVOCATION_FAILED)).toMatchObject([
          {
            properties: {
              tool_slug: 'GITHUB_STAR_REPO',
              http_status: 400,
              api_error_code: 4310,
              error_slug: 'ToolRouterV2_UpstreamRefused',
            },
          },
        ]);
      })
    );
  });

  const unavailable = executingOver(() =>
    Response.json(
      { error: { message: 'Internal error', code: 500, slug: 'Internal', status: 500 } },
      // A retry would wait this long, so one that did happen shows up as a second request.
      { status: 500, headers: { 'retry-after-ms': '0' } }
    )
  );
  // On the live clock: a retry waits on the clock, and under the test clock a
  // retried call would hang instead of failing this test.
  layer(unavailable.testLayer, { excludeTestServices: true })(
    '[Given] the API answers the execution with a 500',
    it => {
      it.effect('[Then] the execution is attempted once', () =>
        Effect.gen(function* () {
          const exit = yield* cli(executeArgs).pipe(Effect.exit);

          expect(Exit.isFailure(exit)).toBe(true);
          expect(unavailable.requests).toMatchObject([
            { method: 'POST', body: { tool_slug: 'GITHUB_STAR_REPO' } },
          ]);
        })
      );
    }
  );

  const incomplete = executingOver(() =>
    // No `log_id`, which the API's response schema requires.
    Response.json({ result_type: 'completed', data: { starred: true }, error: null })
  );
  layer(incomplete.testLayer)('[Given] the execution response lacks a required field', it => {
    it.effect('[Then] the result is still reported', () =>
      Effect.gen(function* () {
        yield* cli(executeArgs);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const result = lines.map(line => line.trim()).findLast(line => line.startsWith('{'));

        expect(JSON.parse(result ?? '')).toMatchObject({
          successful: true,
          data: { starred: true },
        });
      })
    );
  });
});
