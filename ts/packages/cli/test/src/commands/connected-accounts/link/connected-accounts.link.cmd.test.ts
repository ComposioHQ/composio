import { BadRequestError } from '@composio/client/effect';
import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Console, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { makeSessionInfo } from 'test/__utils__/models/account';
import type { MockRequestScope } from 'test/__utils__/services/test-layer';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';
import open from 'open';
import { afterEach, vi } from 'vitest';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

/** The command's JSON result: `ui.output` prints it as the last console line. */
const parseLastLine = (lines: ReadonlyArray<string>): unknown => JSON.parse(String(lines.at(-1)));

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

const connectedAccountWithCredentialFields = {
  ...makeConnectedAccount(),
  state: { access_token: 'must-not-leak' },
  data: { refresh_token: 'must-not-leak' },
};

const noManagedAuth = {
  message: 'No managed auth',
  code: 400,
  slug: 'ToolRouterV2_NoManagedAuth',
  status: 400,
};

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const RecordingTerminalUI = TerminalUI.of({
  capabilities: Effect.succeed(
    getTerminalCapabilities({
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      stderr: { isTTY: true },
    })
  ),
  output: (data, options) =>
    Console.log(
      JSON.stringify({
        channel: options?.force ? 'FORCED' : 'NORMAL',
        data,
      })
    ),
  error: data => Console.error(data),
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
  const toolRouterCreateSpy = vi.fn(() =>
    Effect.succeed({
      session_id: 'trs_test_session',
      config: {
        user_id: 'consumer-user-org_test',
        execute: {},
        search: {},
        preload: { tools: [] },
        instant: false as const,
      },
      config_version: 1,
      mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
      tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
    })
  );
  const toolRouterLinkSpy = vi.fn(() =>
    Effect.succeed({
      connected_account_id: 'con_test_link',
      link_token: 'lt_test_token',
      redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
      account_type: 'PRIVATE' as const,
    })
  );

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] valid toolkit link [Then] creates link and waits (default)', it => {
    it.effect('creates link and waits for ACTIVE', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(parseLastLine(lines)).toMatchObject({
          status: 'success',
          connected_account_id: 'con_test_link',
          toolkit: 'gmail',
        });
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
  )('[Given] --no-browser [Then] waits for ACTIVE without opening the browser', it => {
    it.effect('prints the URL and waits without calling open', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-browser']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(parseLastLine(lines)).toMatchObject({
          status: 'success',
          connected_account_id: 'con_test_link',
        });
        expect(output).toContain('https://app.composio.dev/link?token=lt_test_token');
        expect(output).toContain('Open this URL in your browser to authorize');
        expect(output).not.toContain('Redirecting you to the authorization page');
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
  )('[Given] --list [Then] it shows existing accounts without opening a new link', it => {
    it.effect('lists alias and word_id for existing accounts', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('default');
        expect(output).toContain('castle');
        expect(parseLastLine(lines)).toMatchObject({ toolkit: 'gmail' });
        expect(vi.mocked(open)).not.toHaveBeenCalled();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData({
        items: [
          makeConnectedAccount(),
          makeConnectedAccount({ id: 'con_global', alias: 'global', user_id: 'global-default' }),
        ],
      }),
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] dev connected-accounts link --list in a developer project directory [Then] it lists the test user’s accounts',
    it => {
      // `link` on the dev tree acts on the developer project; it used to list the consumer
      // user's accounts in the consumer project.
      it.effect('lists the global test user’s accounts, not the consumer user’s', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'connected-accounts', 'link', 'gmail', '--list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(lines).toContain('Using global test user id "global-default"');
          expect(parseLastLine(lines)).toMatchObject({
            total: 1,
            items: [{ id: 'con_global', user_id: 'global-default' }],
          });
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
    it.effect('forces the pending JSON payload through output()', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-wait']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const forcedLine = parseLastLine(lines) as { channel: string; data: string };

        expect(forcedLine.channel).toBe('FORCED');
        expect(JSON.parse(forcedLine.data)).toMatchObject({ status: 'pending' });
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
    it.effect('does not emit the raw redirect URL before the pending JSON payload', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-wait']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const forcedLine = parseLastLine(lines) as { channel: string; data: string };

        // Every line before the payload is a log or note, never a second output().
        expect(lines.slice(0, -1)).toEqual([
          'Open this URL in your browser to authorize',
          '[Redirect URL] https://app.composio.dev/link?token=lt_test_token',
        ]);
        expect(forcedLine.channel).toBe('FORCED');
        // The payload parses as JSON, so nothing (such as the raw URL) precedes it.
        expect(JSON.parse(forcedLine.data)).toMatchObject({ status: 'pending' });
      })
    );
  });

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['link', 'gmail']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] a blank --alias [Then] fails with a CLI validation error', it => {
    // Business-level validation (only knowable after parsing) raises `CommandInputError`;
    // see `src/commands/errors.ts`.
    it.effect('reports the invalid option value before making a link request', () =>
      Effect.gen(function* () {
        const error = yield* cli(['link', 'gmail', '--alias', '   ']).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'link',
          option: '--alias',
          message: '`--alias` cannot be empty.',
        });
        expect(vi.mocked(open)).not.toHaveBeenCalled();
      })
    );

    // Logged as decoration, this mistake vanished whenever stderr was not a TTY and the
    // command exited 0; as a `CommandInputError` it reaches stderr and exits 1.
    it.effect('reports a toolkit passed together with --auth-config', () =>
      Effect.gen(function* () {
        const error = yield* cli([
          'dev',
          'connected-accounts',
          'link',
          'gmail',
          '--auth-config',
          'ac_test',
          '--no-wait',
        ]).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'dev connected-accounts link',
          option: '--auth-config',
        });
        expect(vi.mocked(open)).not.toHaveBeenCalled();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: [connectedAccountWithCredentialFields],
      },
      fixture: 'global-test-user-id',
    })
  )('[Given] raw credential fields [Then] --list emits only schema-approved fields', it => {
    it.effect('strips state and data at the response boundary', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).not.toContain('must-not-leak');
        expect(output).not.toContain('access_token');
        expect(output).not.toContain('refresh_token');
        expect(parseLastLine(lines)).toStrictEqual({
          toolkit: 'gmail',
          total: 1,
          items: [makeConnectedAccount()],
        });
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
    it.effect('root link works for consumer toolkit linking only', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(parseLastLine(lines)).toMatchObject({
          status: 'success',
          connected_account_id: 'con_test_link',
        });
      })
    );
  });

  const sessionInfoScopes: MockRequestScope[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
      toolRouter: {
        link: () =>
          Effect.fail(
            new BadRequestError({
              message: `400 ${JSON.stringify({ error: noManagedAuth })}`,
              method: 'POST',
              url: 'https://mock.invalid/api/v3.1/tool_router/session/{session_id}/link',
              status: 400,
              requestId: undefined,
              details: noManagedAuth,
              body: { error: noManagedAuth },
            })
          ),
      },
      accountData: {
        sessionInfo: scope => {
          sessionInfoScopes.push(scope);
          return makeSessionInfo({
            orgId: 'org_selected',
            orgName: 'Selected Org',
            orgMemberId: 'member_selected',
            projectId: 'project_id_selected',
            projectNanoId: 'project_selected',
            projectName: 'Selected Project',
          });
        },
      },
    })
  )('[Given] unmanaged auth after an org switch [Then] resolves the selected membership', it => {
    it.effect('passes the active org to session info before linking analytics identity', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_selected', 'consumer-user-org_selected');

        yield* cli(['link', 'gmail', '--no-browser']);

        expect(sessionInfoScopes.map(scope => scope.orgId)).toEqual(['org_selected']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('/Selected%20Org/~/connect/apps/gmail?open=true');
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
    it.effect('prints JSON with status pending, connected_account_id, redirect_url', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-wait']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(parseLastLine(lines)).toMatchObject({
          status: 'pending',
          connected_account_id: 'con_test_link',
          toolkit: 'gmail',
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
      toolRouter: {
        link: () =>
          Effect.succeed({
            connected_account_id: '',
            link_token: 'lt_test_token',
            redirect_url: '',
            account_type: 'PRIVATE' as const,
          }),
      },
    })
  )('[Given] auth-config link returns an incomplete response [Then] reports it and exits 1', it => {
    it.effect('reports the incomplete response instead of waiting with empty values', () =>
      Effect.gen(function* () {
        // Redirected streams, as under a script: only plain stderr lines and stdout data show.
        const terminal = redirectedTerminalUI();
        yield* cli(['link', 'gmail']).pipe(Effect.provide(terminal.layer));

        expect(terminal.stderr()).toBe(
          'The link response from the API is missing `connected_account_id` or `redirect_url`.\n'
        );
        expect(terminal.stdout()).toBe('');
        expect(process.exitCode).toBe(1);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData(),
      fixture: 'global-test-user-id',
    })
  )('[Given] default (wait) [Then] waits for ACTIVE and outputs success JSON for jq', it => {
    it.effect(
      'prints JSON with status success, message, connected_account_id, toolkit, redirect_url',
      () =>
        Effect.gen(function* () {
          yield* cli(['link', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(parseLastLine(lines)).toMatchObject({
            status: 'success',
            connected_account_id: 'con_test_link',
            toolkit: 'gmail',
          });
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData({
        items: [makeConnectedAccount({ status: 'INITIATED' })],
      }),
      cliUserConfig: { experimentalFeatures: { multi_account: false } },
      toolRouter: {
        create: toolRouterCreateSpy,
        link: toolRouterLinkSpy,
      },
      fixture: 'global-test-user-id',
    })
  )('[Given] --alias [Then] it passes alias during link creation', it => {
    it.effect('sends alias to the tool router link API instead of patching afterward', () =>
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
        link: () =>
          Effect.succeed({
            connected_account_id: 'con_second_link',
            link_token: 'lt_test_token',
            redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
            account_type: 'PRIVATE' as const,
          }),
      },
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] an existing active account and no --alias [Then] link blocks the second connected account',
    it => {
      it.effect('fails locally and tells the user to pass --alias', () =>
        Effect.gen(function* () {
          yield* cli(['link', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Pass --alias to create another one');
          expect(output).toContain('con_test_link');
          expect(output).not.toContain('"status"');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: makeConnectedAccountsData({
        items: [makeConnectedAccount({ alias: 'work' })],
      }),
      toolRouter: { create: toolRouterCreateSpy, link: toolRouterLinkSpy },
      fixture: 'global-test-user-id',
    })
  )('[Given] a duplicate alias [Then] link explains how to use the existing account', it => {
    it.effect('detects the exact existing alias before creating a link', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--alias', 'work']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Alias "work" is already in use');
        expect(output).toContain('composio execute <TOOL_SLUG> --account work');
        expect(output).toContain('composio connections list --toolkit gmail');
        expect(toolRouterCreateSpy).not.toHaveBeenCalled();
        expect(toolRouterLinkSpy).not.toHaveBeenCalled();
      })
    );
  });
});
