import { describe, expect, layer } from '@effect/vitest';
import { Cause, ConfigProvider, Effect, Exit } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';
import { detail, log } from './logs.tools.fixtures';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

describe('CLI: public tool logs over the API client', () => {
  layer(testLayer)(it => {
    it.effect(
      '[Given] unified logs [Then] renders public metadata and preserves the response on stdout',
      () =>
        Effect.gen(function* () {
          const stdoutBefore = (yield* MockConsole.getLines({ stream: 'stdout' })).length;
          const page = { logs: [log], next_cursor: null };
          const stub = stubClientResources(['logs'], () => Response.json(page));
          yield* cli(['dev', 'logs', 'tools']).pipe(Effect.provide(stub.layer));
          const stderr = (yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).join(
            '\n'
          );
          expect(stderr).toContain('2026-01-01T00:00:00.000Z log_send_1');
          expect(stderr).toContain('gmail');
          expect(stderr).toContain('GMAIL_SEND_EMAIL');
          expect(stderr).toContain('412ms');
          expect(stderr).toContain('ca_gmail_1');
          expect((yield* MockConsole.getLines({ stream: 'stdout' })).slice(stdoutBefore)).toEqual([
            JSON.stringify(page, null, 2),
          ]);
        })
    );

    it.effect(
      '[Given] one log id [Then] retrieves public detail and shows its request and response',
      () =>
        Effect.gen(function* () {
          const stdoutBefore = (yield* MockConsole.getLines({ stream: 'stdout' })).length;
          const stub = stubClientResources(['logs'], () => Response.json(detail));
          yield* cli(['dev', 'logs', 'tools', log.id]).pipe(Effect.provide(stub.layer));
          expect(stub.requests).toEqual([
            { method: 'GET', path: '/api/v3.1/logs/tool_execution/log_send_1' },
          ]);
          const stderr = (yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).join(
            '\n'
          );
          expect(stderr).toContain('toolSlug: GMAIL_SEND_EMAIL');
          expect(stderr).toContain('Payload:\n{\n  "to": "a@b.c"\n}');
          expect(stderr).toContain('Response:\n{\n  "id": "msg_1"\n}');
          expect((yield* MockConsole.getLines({ stream: 'stdout' })).slice(stdoutBefore)).toEqual([
            JSON.stringify(detail, null, 2),
          ]);
        })
    );

    it.effect(
      '[Given] drifted metadata and status [Then] keeps tolerant rendering without client decoding',
      () =>
        Effect.gen(function* () {
          const stdoutBefore = (yield* MockConsole.getLines({ stream: 'stdout' })).length;
          const drifted = {
            logs: [
              {
                id: 'log_drift',
                timestamp: log.timestamp,
                status: null,
                metadata: {
                  toolkit: null,
                  tool: { slug: 'GMAIL_SEND_EMAIL' },
                  connected_account_id: null,
                },
                metrics: {},
              },
            ],
          };
          const stub = stubClientResources(['logs'], () => Response.json(drifted));
          yield* cli(['dev', 'logs', 'tools']).pipe(Effect.provide(stub.layer));
          const stderr = (yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).join(
            '\n'
          );
          expect(stderr).toContain('log_drift');
          expect(stderr).toContain('GMAIL_SEND_EMAIL');
          expect(stderr).toContain('0ms');
          expect((yield* MockConsole.getLines({ stream: 'stdout' })).slice(stdoutBefore)).toEqual([
            JSON.stringify(drifted, null, 2),
          ]);
        })
    );

    it.effect.each([
      { args: [], status: 403, message: 'Failed to fetch tool logs.' },
      { args: ['log_missing'], status: 404, message: 'Failed to fetch tool log "log_missing".' },
    ])(
      '[Given] an API error [Then] preserves the error and command context',
      ({ args, status, message }) =>
        Effect.gen(function* () {
          const stub = stubClientResources(['logs'], () =>
            Response.json({ error: { message: 'Not allowed' } }, { status })
          );
          const exit = yield* cli(['dev', 'logs', 'tools', ...args]).pipe(
            Effect.provide(stub.layer),
            Effect.exit
          );
          const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
          expect(failure).toMatchObject({ _tag: 'commands/ToolLogsRequestError', message });
          expect(extractErrorDetails(failure).message).toContain(
            `${status} {"error":{"message":"Not allowed"}}`
          );
        })
    );
  });
});
