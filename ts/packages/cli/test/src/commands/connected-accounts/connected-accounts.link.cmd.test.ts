import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Console, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { TerminalUI } from 'src/services/terminal-ui';
import open from 'open';
import { afterEach, vi } from 'vitest';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

const extractJsonObject = (output: string): Record<string, unknown> | null => {
  const jsonMatch = output.match(/\{[\s\S]*"status"[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
};

const makeConnectedAccount = (overrides?: Partial<ConnectedAccountItem>): ConnectedAccountItem => ({
  id: 'con_test_link',
  alias: 'default',
  word_id: 'castle',
  status: 'ACTIVE',
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
  updated_at: '2026-01-15T00:00:00Z',
  test_request_endpoint: '',
  ...overrides,
});

const makeConnectedAccountsData = (
  overrides?: Partial<NonNullable<TestLiveInput['connectedAccountsData']>>
): NonNullable<TestLiveInput['connectedAccountsData']> => ({
  items: [makeConnectedAccount()],
  ...overrides,
});

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const RecordingTerminalUI = TerminalUI.of({
  output: (data, options) =>
    Console.log(
      JSON.stringify({
        channel: options?.force ? 'FORCED' : 'NORMAL',
        data,
      })
    ),
  intro: title => Console.log(title),
  outro: message => Console.log(message),
  log: {
    info: message => Console.log(message),
    success: message => Console.log(message),
    warn: message => Console.log(message),
    error: message => Console.log(message),
    step: message => Console.log(message),
    message: message => Console.log(message),
  },
  note: (message, title) => Console.log(title ? `[${title}] ${message}` : message),
  confirm: () => Effect.succeed(true),
  select: (_message, options) => Effect.succeed(options[0].value),
  withSpinner: (_message, effect) => effect,
  useMakeSpinner: (_message, use) =>
    use({
      message: () => Effect.void,
      stop: () => Effect.void,
      error: () => Effect.void,
    }),
});

describe('CLI: composio dev connected-accounts link', () => {
  const toolRouterCreateSpy = vi.fn(async () => ({
    session_id: 'trs_test_session',
    config: { user_id: 'consumer-user-org_test' },
    mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
    tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
  }));
  const toolRouterLinkSpy = vi.fn(async () => ({
    connected_account_id: 'con_test_link',
    link_token: 'lt_test_token',
    redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
  }));

  afterEach(() => {
    vi.clearAllMocks();
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] valid toolkit link [Then] creates link and waits (default)', it => {
    it.scoped('creates link and waits for ACTIVE', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = extractJsonObject(lines.join('\n'));

        expect(parsed).not.toBeNull();
        expect(parsed?.status).toBe('success');
        expect(parsed?.connected_account_id).toBe('con_test_link');
        expect(parsed?.toolkit).toBe('gmail');
        expect(vi.mocked(open)).toHaveBeenCalledOnce();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] --list [Then] it shows existing accounts without opening a new link', it => {
    it.scoped('lists alias and word_id for existing accounts', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('default');
        expect(output).toContain('castle');
        expect(output).toContain('"toolkit": "gmail"');
        expect(vi.mocked(open)).not.toHaveBeenCalled();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] dev connected-accounts link --list without developer project context [Then] it still uses consumer resolution',
    it => {
      it.scoped('lists connected accounts instead of requiring a developer project', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'link', 'gmail', '--list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('default');
          expect(output).toContain('castle');
          expect(output).not.toContain('MissingDeveloperProjectError');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
      terminalUI: RecordingTerminalUI,
    })
  )('[Given] --no-wait [Then] emits a forced JSON payload for merged-stream shells', it => {
    it.scoped('forces the pending JSON payload through output()', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-wait']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const forcedLine = lines
          .map(line => {
            try {
              return JSON.parse(line) as { channel?: string; data?: string };
            } catch {
              return null;
            }
          })
          .find(line => line?.channel === 'FORCED');

        expect(forcedLine).toBeTruthy();
        expect(forcedLine?.data).toContain('"status": "pending"');
        expect(vi.mocked(open)).not.toHaveBeenCalled();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
      terminalUI: RecordingTerminalUI,
    })
  )('[Given] --no-wait [Then] stdout remains JSON-only', it => {
    it.scoped('does not emit the raw redirect URL before the pending JSON payload', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-wait']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const forcedLines = lines
          .map(line => {
            try {
              return JSON.parse(line) as { channel?: string; data?: string };
            } catch {
              return null;
            }
          })
          .filter(line => line?.channel === 'FORCED');

        expect(forcedLines).toHaveLength(1);
        expect(forcedLines[0]?.data).toContain('"status": "pending"');
        expect(forcedLines[0]?.data?.trim().startsWith('{')).toBe(true);
      })
    );
  });

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('not logged in');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] composio link [Then] works for consumer toolkit linking', it => {
    it.scoped('root link works for consumer toolkit linking only', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = extractJsonObject(lines.join('\n'));

        expect(parsed).not.toBeNull();
        expect(parsed?.status).toBe('success');
        expect(parsed?.connected_account_id).toBe('con_test_link');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] --no-wait [Then] outputs valid JSON parseable by jq', it => {
    it.scoped('prints JSON with status pending, connected_account_id, redirect_url', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-wait']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = extractJsonObject(lines.join('\n'));

        expect(parsed).not.toBeNull();
        expect(parsed?.status).toBe('pending');
        expect(parsed?.connected_account_id).toBe('con_test_link');
        expect(parsed?.toolkit).toBe('gmail');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
      toolRouter: {
        link: async () => ({
          connected_account_id: '',
          link_token: 'lt_test_token',
          redirect_url: '',
        }),
      },
    })
  )(
    '[Given] auth-config link returns an incomplete response [Then] logs an error and exits early',
    it => {
      it.scoped('reports the incomplete response instead of waiting with empty values', () =>
        Effect.gen(function* () {
          yield* cli(['link', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const parsed = extractJsonObject(lines.join('\n'));

          expect(lines.length).toBeGreaterThan(0);
          expect(parsed).toBeNull();
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] default (wait) [Then] waits for ACTIVE and outputs success JSON for jq', it => {
    it.scoped(
      'prints JSON with status success, message, connected_account_id, toolkit, redirect_url',
      () =>
        Effect.gen(function* () {
          yield* cli(['link', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const parsed = extractJsonObject(lines.join('\n'));

          expect(parsed).not.toBeNull();
          expect(parsed?.status).toBe('success');
          expect(parsed?.connected_account_id).toBe('con_test_link');
          expect(parsed?.toolkit).toBe('gmail');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData({
        items: [makeConnectedAccount({ status: 'INITIATED' })],
      }),
      toolRouter: {
        create: toolRouterCreateSpy,
        link: toolRouterLinkSpy,
      },
      fixture: 'global-test-user-id',
    })
  )('[Given] --alias [Then] it passes alias during link creation', it => {
    it.scoped('sends alias to the tool router link API instead of patching afterward', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--alias', 'work', '--no-wait']);
        expect(toolRouterCreateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            connected_accounts: undefined,
            manage_connections: { enable: true },
            multi_account: {
              enable: true,
              max_accounts_per_toolkit: undefined,
              require_explicit_selection: undefined,
            },
          })
        );
        expect(toolRouterLinkSpy).toHaveBeenCalledWith('trs_test_session', {
          toolkit: 'gmail',
          alias: 'work',
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      toolRouter: {
        link: async () => ({
          connected_account_id: 'con_second_link',
          link_token: 'lt_test_token',
          redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
        }),
      },
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] an existing active account and no --alias [Then] link blocks the second connected account',
    it => {
      it.scoped('fails locally and tells the user to pass --alias', () =>
        Effect.gen(function* () {
          yield* cli(['link', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Pass --alias to create another one');
          expect(output).toContain('con_test_link');
          expect(output).not.toContain('"status": "success"');
        })
      );
    }
  );
});
