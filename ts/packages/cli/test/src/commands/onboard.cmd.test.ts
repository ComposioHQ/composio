import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Console, DateTime, Effect, Option, Schema } from 'effect';
import { afterEach, vi } from 'vitest';
import open from 'open';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { extendConfigProvider } from 'src/services/config';
import { ComposioSessionRepository } from 'src/services/composio-clients';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { readPersistedOnboarding } from 'src/services/onboarding-store';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { ToolsExecutor } from 'src/services/tools-executor';
import { browserLogin } from 'src/commands/login.cmd';
import { linkRootConsumerToolkit } from 'src/commands/connected-accounts/commands/connected-accounts.link.cmd';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

const loggedInConfig = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const capabilities = (canPrompt: boolean) =>
  getTerminalCapabilities({
    stdin: { isTTY: canPrompt },
    stdout: { isTTY: canPrompt },
    stderr: { isTTY: canPrompt },
  });

const quietUI = (canPrompt: boolean) =>
  TerminalUI.of({
    ...terminalUITestImpl,
    capabilities: Effect.succeed(capabilities(canPrompt)),
    output: data => Console.log(data),
    intro: () => Effect.void,
    outro: () => Effect.void,
    log: {
      info: () => Effect.void,
      success: () => Effect.void,
      warn: () => Effect.void,
      error: () => Effect.void,
      step: () => Effect.void,
      message: () => Effect.void,
    },
    note: () => Effect.void,
  });

const machineUI = quietUI(false);
const interactiveUI = TerminalUI.of({
  ...quietUI(true),
  output: () => Effect.void,
  select: (_message, options) => Effect.succeed(options[1]!.value),
});

const makeAccount = (status: 'ACTIVE' | 'INITIATED') => ({
  id: 'con_gmail',
  alias: 'default',
  word_id: 'castle',
  status,
  status_reason: null,
  is_disabled: false,
  user_id: 'consumer-user-org_test',
  toolkit: { slug: 'gmail' },
  auth_config: {
    id: 'ac_gmail_oauth',
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_disabled: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  test_request_endpoint: '',
});

const stateOutput = Effect.gen(function* () {
  const lines = yield* MockConsole.getLines({ stripAnsi: true });
  const documents = lines.filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  expect(documents).toHaveLength(1);
  return documents[0] as Record<string, unknown>;
});

const pendingLink = vi.fn(async () => ({
  connected_account_id: 'con_gmail',
  link_token: 'secret',
  redirect_url: 'https://example.test/oauth',
  account_type: 'PRIVATE' as const,
}));

const jsonAccounts: Array<ReturnType<typeof makeAccount>> = [];
const jsonLink = vi.fn(async () => {
  jsonAccounts.push(makeAccount('INITIATED'));
  return {
    connected_account_id: 'con_gmail',
    link_token: 'lt_test_token',
    redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
    account_type: 'PRIVATE' as const,
  };
});

const statusLink = vi.fn(async () => ({
  connected_account_id: 'con_gmail',
  link_token: 'secret',
  redirect_url: 'https://example.test/oauth',
  account_type: 'PRIVATE' as const,
}));

const interactiveAccounts: Array<ReturnType<typeof makeAccount>> = [];
const interactiveLink = vi.fn(async () => {
  interactiveAccounts.push(makeAccount('ACTIVE'));
  return {
    connected_account_id: 'con_gmail',
    link_token: 'lt_test_token',
    redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
    account_type: 'PRIVATE' as const,
  };
});

const sessionInfo = {
  project: {
    name: 'Consumer Project',
    id: 'consumer_project_id_test',
    org_id: 'org_test',
    nano_id: 'consumer_project_test',
    email: 'project@example.com',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    org: { id: 'org_test', name: 'Test Org', plan: 'enterprise' },
  },
  org_member: {
    id: 'member_test',
    user_id: 'user_test',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin',
  },
  api_key: null,
};

describe('CLI: composio onboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfig,
      fixture: 'global-test-user-id',
      terminalUI: machineUI,
      toolRouter: { link: statusLink },
    })
  )(it => {
    it.scoped('[Given] --status --json [Then] reports facts without side effects', () =>
      Effect.gen(function* () {
        yield* Console.clear;
        const execute = vi.fn(() =>
          Effect.succeed({ successful: true, data: {}, error: null, logId: 'log_test' })
        );

        yield* cli(['onboard', '--toolkit', 'gmail', '--status', '--json']).pipe(
          Effect.provideService(ToolsExecutor, ToolsExecutor.of({ execute }))
        );

        expect(statusLink).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
        expect(vi.mocked(open)).not.toHaveBeenCalled();
        expect(yield* stateOutput).toMatchObject({
          kind: 'onboard_state',
          next_gate: 'connect',
          toolkit: 'gmail',
        });
      })
    );

    it.scoped('[Given] an unsupported toolkit [Then] fails with a typed error', () =>
      Effect.gen(function* () {
        yield* Console.clear;
        const error = yield* cli(['onboard', '--toolkit', 'dropbox', '--json']).pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: 'commands/UnsupportedOnboardingToolkitError',
        });
      })
    );

    it.scoped('[Given] machine mode without a toolkit [Then] lists curated choices', () =>
      Effect.gen(function* () {
        yield* Console.clear;
        yield* cli(['onboard', '--json']);
        expect(yield* stateOutput).toMatchObject({
          blocked_reason: 'toolkit_required',
          available_toolkits: ['github', 'gmail', 'slack', 'linear', 'notion'],
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfig,
      fixture: 'global-test-user-id',
      terminalUI: machineUI,
      connectedAccountsData: { items: [makeAccount('INITIATED')] },
      toolRouter: { link: pendingLink },
    })
  )(it => {
    it.scoped('[Given] pending OAuth [Then] reuses it without creating another link', () =>
      Effect.gen(function* () {
        yield* cli(['onboard', '--toolkit', 'gmail', '--json']);
        expect(yield* stateOutput).toMatchObject({
          blocked_reason: 'oauth_required',
          human_action: null,
        });
        expect(pendingLink).not.toHaveBeenCalled();
        expect(vi.mocked(open)).not.toHaveBeenCalled();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfig,
      fixture: 'global-test-user-id',
      terminalUI: machineUI,
      connectedAccountsData: { items: jsonAccounts },
      toolRouter: { link: jsonLink },
    })
  )(it => {
    it.scoped('[Given] JSON mode [Then] advances one link gate and emits one document', () =>
      Effect.gen(function* () {
        jsonAccounts.length = 0;
        yield* cli(['onboard', '--toolkit', 'gmail', '--json']);
        expect(yield* stateOutput).toMatchObject({
          next_gate: 'connect',
          blocked_reason: 'oauth_required',
          human_action: 'https://app.composio.dev/link?token=lt_test_token',
          next_command: 'composio onboard --toolkit gmail --json',
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfig,
      fixture: 'global-test-user-id',
      terminalUI: machineUI,
      connectedAccountsData: { items: [makeAccount('ACTIVE')] },
    })
  )(it => {
    it.scoped('[Given] provider auth failure [Then] fails and leaves completion false', () =>
      Effect.gen(function* () {
        const execute = vi.fn(() => Effect.fail(new Error('raw provider token must not leak')));
        const error = yield* cli(['onboard', '--toolkit', 'gmail', '--json']).pipe(
          Effect.provideService(ToolsExecutor, ToolsExecutor.of({ execute })),
          Effect.flip
        );

        expect(error).toMatchObject({ _tag: 'commands/OnboardingToolExecutionError' });
        expect((error as { message: string }).message).toContain('composio link gmail');
        expect((error as { message: string }).message).not.toContain('raw provider token');
        expect((yield* readPersistedOnboarding).hasExecuted).toBe(false);
      })
    );
  });

  layer(
    TestLive({
      terminalUI: interactiveUI,
      connectedAccountsData: { items: interactiveAccounts },
      toolRouter: { link: interactiveLink },
    })
  )(it => {
    it.scoped(
      '[Given] an interactive first run [Then] advances login, connect, and execute once',
      () =>
        Effect.gen(function* () {
          interactiveAccounts.length = 0;
          const now = yield* DateTime.now;
          const createSession = vi.fn(() =>
            Effect.succeed({
              id: 'session_test',
              code: '001122',
              expiresAt: DateTime.add(now, { minutes: 10 }),
              status: 'pending' as const,
            })
          );
          const sessions = new ComposioSessionRepository({
            createSession,
            getSession: () =>
              Effect.succeed({
                id: 'session_test',
                code: '001122',
                expiresAt: DateTime.add(now, { minutes: 10 }),
                status: 'linked' as const,
                api_key: 'uak_onboard',
                account: { id: 'account_test', name: 'Test User', email: 'test@example.com' },
              }),
            getRealtimeCredentials: () =>
              Effect.succeed({
                project_id: 'proj_test',
                pusher_key: 'pusher_test',
                pusher_cluster: 'mt1',
              }),
            authRealtimeChannel: () => Effect.succeed({ auth: 'mock:auth' }),
          });
          const execute = vi.fn(() =>
            Effect.succeed({
              successful: true,
              data: { messages: [{ id: 'private-result' }] },
              error: null,
              logId: 'log_test',
            })
          );
          const originalFetch = globalThis.fetch;
          vi.spyOn(globalThis, 'fetch').mockImplementation(async (request, init) => {
            const url = typeof request === 'string' ? request : request.toString();
            return url.includes('/api/v3/auth/session/info')
              ? new Response(JSON.stringify(sessionInfo), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                })
              : originalFetch(request, init);
          });

          const result = yield* cli(['onboard']).pipe(
            Effect.provideService(ComposioSessionRepository, sessions),
            Effect.provideService(ToolsExecutor, ToolsExecutor.of({ execute }))
          );

          expect(result).toMatchObject({ onboarded: true, next_gate: null });
          expect(createSession).toHaveBeenCalledOnce();
          expect(interactiveLink).toHaveBeenCalledOnce();
          expect(execute).toHaveBeenCalledOnce();
          expect((yield* readPersistedOnboarding).hasExecuted).toBe(true);
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfig,
      fixture: 'global-test-user-id',
      terminalUI: machineUI,
      connectedAccountsData: { items: [makeAccount('ACTIVE')] },
    })
  )(it => {
    it.scoped(
      '[Given] local persistence fails [Then] successful execution still resolves done',
      () =>
        Effect.gen(function* () {
          const currentConfig = yield* ComposioCliUserConfig;
          const failingConfig = ComposioCliUserConfig.of({
            ...currentConfig,
            update: () => Schema.decodeUnknown(Schema.Never)(null).pipe(Effect.asVoid),
          });
          const execute = vi.fn(() =>
            Effect.succeed({
              successful: true,
              data: { messages: [] },
              error: null,
              logId: 'log_test',
            })
          );

          yield* cli(['onboard', '--toolkit', 'gmail', '--json']).pipe(
            Effect.provideService(ComposioCliUserConfig, failingConfig),
            Effect.provideService(ToolsExecutor, ToolsExecutor.of({ execute }))
          );

          expect(execute).toHaveBeenCalledOnce();
          expect(yield* stateOutput).toMatchObject({ onboarded: true, next_gate: null });
          expect(failingConfig.data.onboarding.hasExecuted).toBe(false);
        })
    );
  });

  layer(TestLive({ terminalUI: machineUI }))(it => {
    it.scoped('[Given] logged-out JSON mode [Then] returns the pending login URL in state', () =>
      Effect.gen(function* () {
        yield* cli(['onboard', '--toolkit', 'gmail', '--json']);
        expect(yield* stateOutput).toMatchObject({
          blocked_reason: 'login_required',
          human_action:
            'https://dashboard.composio.dev/?cliKey=te00st11-d0c4-4efa-8117-c638886063e0',
        });
      })
    );
  });
});

describe('onboarding primitives', () => {
  layer(TestLive({ terminalUI: machineUI }))(it => {
    it.scoped('browserLogin returns pending with its URL without writing stdout', () =>
      Effect.gen(function* () {
        const result = yield* browserLogin({
          scope: 'user',
          noBrowser: true,
          noWait: true,
          suppressOutput: true,
        });
        expect(result).toMatchObject({
          status: 'pending',
          url: 'https://dashboard.composio.dev/?cliKey=te00st11-d0c4-4efa-8117-c638886063e0',
        });
        expect(yield* MockConsole.getLines()).toEqual([]);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfig,
      fixture: 'global-test-user-id',
      terminalUI: machineUI,
    })
  )(it => {
    it.scoped('root toolkit linking returns pending without writing stdout', () =>
      Effect.gen(function* () {
        const result = yield* linkRootConsumerToolkit({ toolkit: 'gmail', wait: false });
        expect(result).toEqual({
          status: 'pending',
          connectedAccountId: 'con_test_link',
          redirectUrl: 'https://app.composio.dev/link?token=lt_test_token',
        });
        expect(yield* MockConsole.getLines()).toEqual([]);
      })
    );
  });
});
