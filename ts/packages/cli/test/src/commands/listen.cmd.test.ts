import { ValidationError } from '@effect/cli';
import { describe, expect, layer } from '@effect/vitest';
import { Cause, ConfigProvider, Effect, Exit } from 'effect';
import { ListenCommandError } from 'src/commands/listen.cmd';
import { extendConfigProvider } from 'src/services/config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const enableListen = Effect.gen(function* () {
  const config = yield* ComposioCliUserConfig;
  yield* config.update({
    experimentalFeatures: {
      ...config.raw.experimentalFeatures,
      listen: true,
    },
  });
});

describe('CLI: composio listen', () => {
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [
          {
            id: 'evt_conn_expired_1',
            type: 'composio.connected_account.expired',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              project_id: 'consumer_project_id_test',
              org_id: 'org_test',
            },
            data: {
              id: 'con_expired_1',
            },
          },
        ],
      },
    })
  )(it => {
    it.scoped(
      '[Then] listens to top-level composio.* events without creating a temporary trigger',
      () =>
        Effect.gen(function* () {
          yield* enableListen;
          yield* cli(['listen', 'composio.connected_account.expired', '--max-events', '1']);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('listening for events composio.connected_account.expired');
          expect(output).toContain('/events/composio.connected_account.expired/');
          expect(output).toContain('Stopped after receiving 1 event.');
          expect(output).not.toContain('Temporary trigger disabled');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      connectedAccountsData: {
        items: [
          {
            id: 'con_gmail_test',
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'consumer-user-org_test',
            toolkit: {
              slug: 'gmail',
            },
            auth_config: {
              id: 'auth_gmail_test',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
              is_disabled: false,
            },
            created_at: '2026-04-06T17:59:00.000Z',
            updated_at: '2026-04-06T18:00:00.000Z',
            test_request_endpoint: '',
          },
        ],
      },
      realtimeData: {
        events: [
          {
            id: 'evt_trigger_1',
            type: 'composio.trigger.message',
            timestamp: '2026-04-06T18:00:00.000Z',
            metadata: {
              log_id: 'log_1',
              trigger_slug: 'GMAIL_NEW_GMAIL_MESSAGE',
              trigger_id: 'trg_gmail_new_gmail_message_con_gmail_test',
              connected_account_id: 'con_gmail_test',
              auth_config_id: 'auth_gmail_test',
              user_id: 'consumer-user-org_test',
            },
            data: {
              threadId: 'thread_123',
            },
          },
        ],
      },
    })
  )(it => {
    it.scoped('[Then] keeps the temporary-trigger flow for trigger slugs', () =>
      Effect.gen(function* () {
        yield* enableListen;
        yield* cli(['listen', 'GMAIL_NEW_GMAIL_MESSAGE', '--max-events', '1']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('listening for events GMAIL_NEW_GMAIL_MESSAGE');
        expect(output).toContain('/triggers/GMAIL_NEW_GMAIL_MESSAGE/');
        expect(output).toContain('Stopped after receiving 1 event. Temporary trigger disabled.');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
    })
  )('listen validation and domain failures', it => {
    it.scoped('reports malformed trigger params as CLI input validation', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const exit = yield* Effect.exit(
          cli(['listen', 'composio.connected_account.expired', '--params', '[]'])
        );

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.squash(exit.cause);
          expect(
            ValidationError.isValidationError(failure) && ValidationError.isInvalidValue(failure)
          ).toBe(true);
        }
      })
    );

    it.scoped('reports malformed timeout values as CLI input validation', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const exit = yield* Effect.exit(
          cli(['listen', 'composio.connected_account.expired', '--timeout', 'eventually'])
        );

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.squash(exit.cause);
          expect(
            ValidationError.isValidationError(failure) && ValidationError.isInvalidValue(failure)
          ).toBe(true);
        }
      })
    );

    it.scoped('reports a missing active connection as a structured domain failure', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const exit = yield* Effect.exit(cli(['listen', 'GMAIL_NEW_GMAIL_MESSAGE']));

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.squash(exit.cause);
          expect(failure).toBeInstanceOf(ListenCommandError);
          if (failure instanceof ListenCommandError) {
            expect(failure).toMatchObject({
              reason: 'connected_account_not_found',
              toolkitSlug: 'gmail',
            });
          }
        }
      })
    );
  });
});
