import { afterEach } from 'vitest';
import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Fiber, Latch, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { ListenCommandError } from 'src/commands/listen.cmd';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { ConnectedAccountResolutionError } from 'src/services/connected-account-selection';
import { MissingActingUserError } from 'src/commands/surface';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioUserContext } from 'src/services/user-context';
import { TriggerRealtimeSubscriptionError, TriggersRealtime } from 'src/services/triggers-realtime';
import {
  makeShutdownController,
  ShutdownSignal,
  type ShutdownController,
} from 'src/services/shutdown-signal';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { failingFileWrites } from 'test/__utils__/services/failing-file-writes';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const enableListen = Effect.gen(function* () {
  const config = yield* ComposioCliUserConfig;
  yield* config.update({
    experimentalFeatures: {
      ...config.raw.experimentalFeatures,
      listen: true,
    },
  });
});

const failingRealtime = Layer.succeed(
  TriggersRealtime,
  TriggersRealtime.of({
    listen: () => Effect.fail(new TriggerRealtimeSubscriptionError({ message: 'socket closed' })),
    listenInProject: () =>
      Effect.fail(new TriggerRealtimeSubscriptionError({ message: 'socket closed' })),
  })
);

describe('CLI: composio listen', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] the realtime subscription fails',
    it => {
      it.effect('[Then] reports it on a redirected stderr and exits 1', () =>
        Effect.gen(function* () {
          yield* enableListen;
          const terminal = redirectedTerminalUI();
          const exit = yield* Effect.exit(
            cli(['listen', 'composio.connected_account.expired', '--max-events', '1']).pipe(
              Effect.provide(Layer.merge(failingRealtime, terminal.layer))
            )
          );

          expect(terminal.stderr()).toContain(
            'Could not subscribe to realtime trigger events: socket closed. Check your network connection or run `composio login`.\n'
          );
          expect(exitCodeOf(exit)).toBe(1);
        })
      );

      // Still connecting: a signal now interrupts the listener, so the CLI exits 130/143.
      it.effect(
        '[When] a signal arrives before the subscription exists [Then] it is not taken',
        () =>
          Effect.gen(function* () {
            yield* enableListen;
            const shutdown = makeShutdownController();
            const connecting = Latch.makeUnsafe(false);
            const neverSubscribes = Layer.succeed(
              TriggersRealtime,
              TriggersRealtime.of({
                listen: () => Effect.never,
                listenInProject: () => Effect.andThen(connecting.open, Effect.never),
              })
            );
            const fiber = yield* Effect.forkChild(
              cli(['listen', 'composio.connected_account.expired']).pipe(
                Effect.provide(Layer.merge(neverSubscribes, redirectedTerminalUI().layer)),
                Effect.provideService(ShutdownSignal, shutdown.service)
              )
            );
            yield* connecting.await;

            expect(shutdown.offer('SIGINT')).toBe(false);
            yield* Fiber.interrupt(fiber);
            expect(exitCodeOf(yield* Fiber.await(fiber))).toBe(130);
          })
      );
    }
  );

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
    it.effect(
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

    it.effect('[Then] a bare --stream flag prints the whole event payload inline', () =>
      Effect.gen(function* () {
        yield* enableListen;
        yield* cli([
          'listen',
          'composio.connected_account.expired',
          '--max-events',
          '1',
          '--stream',
        ]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).not.toContain('Received unknown argument');
        expect(output).toContain('stream: ');
        expect(output).toContain('"data":{"id":"con_expired_1"}');
      })
    );

    it.effect('[Then] a bare --stream flag followed by another option is not swallowed', () =>
      Effect.gen(function* () {
        yield* enableListen;
        yield* cli([
          'listen',
          'composio.connected_account.expired',
          '--stream',
          '--max-events',
          '1',
        ]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('stream: ');
        expect(output).toContain('Stopped after receiving 1 event.');
      })
    );
  });

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
  )('[Given] event payloads that cannot be written', it => {
    const payloadWritesFail = failingFileWrites(path => path.endsWith('-payload.json'));

    // The write failure logs its warn only after it was counted, so the latch is an ordered
    // count-is-set signal — no polling, no sleeps.
    const listenUntilWriteFails = (
      args: ReadonlyArray<string>,
      shutdown: ShutdownController = makeShutdownController()
    ) =>
      Effect.gen(function* () {
        const writeFailed = Latch.makeUnsafe(false);
        const terminal = redirectedTerminalUI({
          onWarn: message => {
            if (message.includes('-payload.json')) writeFailed.openUnsafe();
          },
        });
        const fiber = yield* Effect.forkChild(
          cli(['listen', 'composio.connected_account.expired', ...args]).pipe(
            Effect.provide(Layer.merge(payloadWritesFail, terminal.layer)),
            Effect.provideService(ShutdownSignal, shutdown.service)
          )
        );
        yield* writeFailed.await;
        return { fiber, terminal };
      });

    // A failed write still counts toward --max-events, so the bounded run stops on its own.
    it.effect('[Then] stops at --max-events and sums the write failures up on stderr', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const terminal = redirectedTerminalUI();
        yield* cli(['listen', 'composio.connected_account.expired', '--max-events', '1']).pipe(
          Effect.provide(Layer.merge(payloadWritesFail, terminal.layer))
        );

        expect(terminal.stderr()).toContain('1 event failed to write while listening.');
      })
    );

    // No --max-events or --timeout: only --fail-fast can stop this run.
    it.effect('[Then] --fail-fast stops at the first failed write and exits 1', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const terminal = redirectedTerminalUI();
        const exit = yield* Effect.exit(
          cli(['listen', 'composio.connected_account.expired', '--fail-fast']).pipe(
            Effect.provide(Layer.merge(payloadWritesFail, terminal.layer))
          )
        );

        expect(terminal.stderr()).toContain('1 event failed to write while listening.');
        expect(exitCodeOf(exit)).toBe(1);
      })
    );

    it.effect('[Then] sums the write failures up on stderr when the timeout stops it', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const { fiber, terminal } = yield* listenUntilWriteFails(['--timeout', '1s']);

        yield* TestClock.adjust('1 second');
        yield* Fiber.join(fiber);

        expect(terminal.stderr()).toContain('1 event failed to write while listening.');
      })
    );

    // Ctrl+C or SIGTERM once subscribed: the listener stops itself, runs its release, succeeds.
    it.effect.each(['SIGINT', 'SIGTERM'] as const)(
      '[When] %s arrives after the subscription [Then] it stops cleanly, sums up, and exits 0',
      signal =>
        Effect.gen(function* () {
          yield* enableListen;
          const shutdown = makeShutdownController();
          const { fiber, terminal } = yield* listenUntilWriteFails([], shutdown);

          expect(shutdown.offer(signal)).toBe(true);
          const exit = yield* Fiber.await(fiber);

          expect(terminal.stderr()).toContain('1 event failed to write while listening.');
          expect(exitCodeOf(exit)).toBe(0);
        })
    );

    // A closed terminal is not a stop the listener handles: the runner interrupts it (129).
    it.effect('[When] SIGHUP arrives [Then] the listener does not take it', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const shutdown = makeShutdownController();
        const { fiber } = yield* listenUntilWriteFails([], shutdown);

        expect(shutdown.offer('SIGHUP')).toBe(false);
        yield* Fiber.interrupt(fiber);
      })
    );

    // A signal the listener does not take (before the subscription, or SIGHUP): the runner
    // interrupts the listener fiber; the release hook must run the summary anyway.
    it.effect('[Then] sums the write failures up even when the listener is interrupted', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const { fiber, terminal } = yield* listenUntilWriteFails([]);

        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);

        expect(terminal.stderr()).toContain('1 event failed to write while listening.');
        // Interrupted, not failed: the summary alone does not fail the command.
        expect(exitCodeOf(exit)).toBe(130);
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
    it.effect('[Then] keeps the temporary-trigger flow for trigger slugs', () =>
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

  const gmailAccount = (id: string, alias: string, updatedAt: string): ConnectedAccountItem => ({
    id,
    alias,
    word_id: null,
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'consumer-user-org_test',
    toolkit: { slug: 'gmail' },
    auth_config: {
      id: 'auth_gmail_test',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-04-06T17:00:00.000Z',
    updated_at: updatedAt,
    test_request_endpoint: '',
  });

  const gmailMessageFor = (connectedAccountId: string) => ({
    id: `evt_${connectedAccountId}`,
    type: 'composio.trigger.message',
    timestamp: '2026-04-06T18:00:00.000Z',
    metadata: {
      log_id: `log_${connectedAccountId}`,
      trigger_slug: 'GMAIL_NEW_GMAIL_MESSAGE',
      trigger_id: `trg_gmail_new_gmail_message_${connectedAccountId}`,
      connected_account_id: connectedAccountId,
      auth_config_id: 'auth_gmail_test',
      user_id: 'consumer-user-org_test',
    },
    data: { threadId: `thread_${connectedAccountId}` },
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      connectedAccountsData: {
        items: [
          gmailAccount('con_work', 'work', '2026-04-06T18:00:00.000Z'),
          gmailAccount('con_personal', 'personal', '2026-04-06T18:01:00.000Z'),
        ],
      },
      toolkitsData: {
        triggerTypes: [
          {
            slug: 'GMAIL_NEW_GMAIL_MESSAGE',
            name: 'New Gmail Message',
            description: 'Fires when a new email arrives.',
            instructions: '',
            type: 'poll',
            config: {},
            payload: {},
            toolkit: { name: 'Gmail', slug: 'gmail' },
          },
        ],
      },
      // One event per account, so the run stops whichever account the temporary trigger uses.
      realtimeData: {
        events: [gmailMessageFor('con_work'), gmailMessageFor('con_personal')],
      },
    })
  )('[Given] several active accounts for the inferred toolkit', it => {
    it.effect('[Then] --account picks the matching account for the temporary trigger', () =>
      Effect.gen(function* () {
        yield* enableListen;
        yield* cli([
          'listen',
          'GMAIL_NEW_GMAIL_MESSAGE',
          '--account',
          'work',
          '--max-events',
          '1',
          '--debug',
        ]);

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('trigger_id=trg_gmail_new_gmail_message_con_work ');
        expect(output).toContain('Stopped after receiving 1 event. Temporary trigger disabled.');
      })
    );

    it.effect(
      '[Then] an --account that matches none fails like `composio execute` and `composio proxy`',
      () =>
        Effect.gen(function* () {
          yield* enableListen;
          const failure = yield* cli([
            'listen',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--account',
            'nope',
          ]).pipe(Effect.flip);

          // An expected failure: `cli-main.ts` prints the message and exits 1.
          expect(failure).toBeInstanceOf(ConnectedAccountResolutionError);
          expect(failure).toMatchObject({
            toolkitSlug: 'gmail',
            message:
              'No connected account matched "nope" for toolkit "gmail". Available accounts: personal (con_personal), work (con_work).',
          });
        })
    );

    it.effect(
      '[Then] no --account and no default alias fails like `composio execute` and `composio proxy`',
      () =>
        Effect.gen(function* () {
          yield* enableListen;
          // --max-events bounds the run, so a listener that picked an account stops instead of hanging.
          const failure = yield* cli([
            'listen',
            'GMAIL_NEW_GMAIL_MESSAGE',
            '--max-events',
            '1',
          ]).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(ConnectedAccountResolutionError);
          expect(failure).toMatchObject({
            toolkitSlug: 'gmail',
            message:
              'Multiple connected accounts exist for toolkit "gmail" and no --account was given. Available accounts: personal (con_personal), work (con_work). Pass --account <alias or id> to choose one.',
          });
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      toolkitsData: {
        triggerTypes: [
          {
            slug: 'GMAIL_NEW_GMAIL_MESSAGE',
            name: 'New Gmail Message',
            description: 'Fires when a new email arrives.',
            instructions: '',
            type: 'poll',
            config: {},
            payload: {},
            toolkit: { name: 'Gmail', slug: 'gmail' },
          },
        ],
      },
    })
  )('listen validation and domain failures', it => {
    // Business-level validation (only knowable after parsing) raises `CommandInputError`;
    // see `src/commands/errors.ts`.
    it.effect('reports malformed trigger params as CLI input validation', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const failure = yield* cli([
          'listen',
          'composio.connected_account.expired',
          '--params',
          '[]',
        ]).pipe(Effect.flip);

        expect(failure).toMatchObject({ _tag: 'commands/CommandInputError', command: 'listen' });
      })
    );

    it.effect('reports malformed timeout values as CLI input validation', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const failure = yield* cli([
          'listen',
          'composio.connected_account.expired',
          '--timeout',
          'eventually',
        ]).pipe(Effect.flip);

        expect(failure).toMatchObject({ _tag: 'commands/CommandInputError', command: 'listen' });
      })
    );

    it.effect('reports a missing active connection as a structured domain failure', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const failure = yield* cli(['listen', 'GMAIL_NEW_GMAIL_MESSAGE']).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(ListenCommandError);
        expect(failure).toMatchObject({
          reason: 'connected_account_not_found',
          toolkitSlug: 'gmail',
        });
      })
    );

    it.effect('reports an unknown trigger slug instead of a missing connection', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const failure = yield* cli(['listen', 'BOGUS_SLUG_XYZ']).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(ListenCommandError);
        expect(failure).toMatchObject({
          reason: 'unknown_trigger',
          slug: 'BOGUS_SLUG_XYZ',
          toolkitSlug: 'bogus',
          message: expect.stringContaining('Unknown trigger slug "BOGUS_SLUG_XYZ"'),
        });
        expect(failure).toHaveProperty(
          'message',
          expect.stringContaining('composio triggers list <toolkit>')
        );
        expect(failure).toHaveProperty('message', expect.not.stringContaining('composio link'));
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
      toolkitsData: {
        triggerTypes: [
          {
            slug: 'GMAIL_NEW_GMAIL_MESSAGE',
            name: 'New Gmail Message',
            description: 'Fires when a new email arrives.',
            instructions: '',
            type: 'poll',
            config: {},
            payload: {},
            toolkit: { name: 'Gmail', slug: 'gmail' },
          },
        ],
      },
      triggersData: { rejectUnknownTriggerSlugs: true },
    })
  )('[Given] an active account for the inferred toolkit', it => {
    it.effect('[Then] reports an unknown trigger slug instead of a creation failure', () =>
      Effect.gen(function* () {
        yield* enableListen;
        const failure = yield* cli(['listen', 'GMAIL_NEW_GMAIL_MESAGE']).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(ListenCommandError);
        expect(failure).toMatchObject({
          reason: 'unknown_trigger',
          slug: 'GMAIL_NEW_GMAIL_MESAGE',
          message: expect.stringContaining('Unknown trigger slug "GMAIL_NEW_GMAIL_MESAGE"'),
        });
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, accountData: { consumerUserId: '' } }))(
    '[Given] no consumer user in the project context',
    it => {
      it.effect('[Then] fails before subscribing with the missing-user error', () =>
        Effect.gen(function* () {
          const userContext = yield* ComposioUserContext;
          yield* userContext.login('test_api_key', 'org_test');
          yield* enableListen;
          const failure = yield* cli([
            'listen',
            'composio.connected_account.expired',
            '--max-events',
            '1',
          ]).pipe(Effect.flip);

          // An empty id counts as no user, so listen fails with the shared missing-user error.
          expect(failure).toBeInstanceOf(MissingActingUserError);
          expect(failure).toMatchObject({
            message: 'Missing consumer user id. Run `composio login` and try again.',
          });
        })
      );
    }
  );
});
