import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Console, Effect, Option } from 'effect';
import { HelpDoc, ValidationError } from '@effect/cli';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { runConnectedAccountsLink } from 'src/commands/connected-accounts/commands/connected-accounts.link.cmd';
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

const connectedAccountWithCredentialFields = {
  ...makeConnectedAccount(),
  state: { access_token: 'must-not-leak' },
  data: { refresh_token: 'must-not-leak' },
};

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

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
  text: () => Effect.succeed(Option.none<string>()),
  select: (_message, options) => Effect.succeed(options[0].value),
  selectOption: (_message, options) => Effect.succeed(Option.some(options[0].value)),
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
    config: {
      user_id: 'consumer-user-org_test',
      execute: {},
      search: {},
      preload: { tools: [] },
    },
    config_version: 1,
    mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
    tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
  }));
  const toolRouterLinkSpy = vi.fn(async () => ({
    connected_account_id: 'con_test_link',
    link_token: 'lt_test_token',
    redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
    account_type: 'PRIVATE' as const,
  }));

  afterEach(() => {
    vi.restoreAllMocks();
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
  )('[Given] --no-browser [Then] waits for ACTIVE without opening the browser', it => {
    it.scoped('prints the URL and waits without calling open', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--no-browser']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        const parsed = extractJsonObject(output);

        expect(parsed).not.toBeNull();
        expect(parsed?.status).toBe('success');
        expect(parsed?.connected_account_id).toBe('con_test_link');
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
  )('[Given] a blank --alias [Then] fails with a CLI validation error', it => {
    it.scoped('reports the invalid option value before making a link request', () =>
      Effect.gen(function* () {
        const error = yield* cli(['link', 'gmail', '--alias', '   ']).pipe(Effect.flip);

        expect(ValidationError.isValidationError(error)).toBe(true);
        if (!ValidationError.isValidationError(error)) return;
        expect(ValidationError.isInvalidValue(error)).toBe(true);
        expect(HelpDoc.toAnsiText(error.error)).toContain('`--alias` cannot be empty.');
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
    it.scoped('strips state and data at the response boundary', () =>
      Effect.gen(function* () {
        yield* cli(['link', 'gmail', '--list']);

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).not.toContain('must-not-leak');
        expect(output).not.toContain('access_token');
        expect(output).not.toContain('refresh_token');
        expect(extractJsonObject(output)).toStrictEqual({
          kind: 'connected_account_link',
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
      toolRouter: {
        link: async () => {
          throw Object.assign(new Error('No managed auth'), {
            slug: 'ToolRouterV2_NoManagedAuth',
          });
        },
      },
    })
  )('[Given] unmanaged auth after an org switch [Then] resolves the selected membership', it => {
    it.scoped('passes the active org to session info before linking analytics identity', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_selected', 'consumer-user-org_selected');

        const originalFetch = globalThis.fetch;
        const sessionInfoRequests: Headers[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
          async (requestInput: RequestInfo | URL, init?: RequestInit) => {
            const url =
              typeof requestInput === 'string'
                ? requestInput
                : requestInput instanceof URL
                  ? requestInput.toString()
                  : requestInput.url;

            if (url.includes('/api/v3/auth/session/info')) {
              const headers = new Headers(init?.headers);
              sessionInfoRequests.push(headers);
              return new Response(
                JSON.stringify({
                  project: {
                    name: 'Selected Project',
                    id: 'project_id_selected',
                    org_id: 'org_selected',
                    nano_id: 'project_selected',
                    email: 'project@example.com',
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-01T00:00:00.000Z',
                    org: {
                      id: 'org_selected',
                      name: 'Selected Org',
                      plan: 'enterprise',
                    },
                  },
                  org_member: {
                    id: 'member_selected',
                    user_id: 'user_123',
                    email: 'cli@example.com',
                    name: 'CLI User',
                    role: 'admin',
                  },
                  api_key: null,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                }
              );
            }

            return originalFetch(requestInput, init);
          }
        );

        yield* cli(['link', 'gmail', '--no-browser']);

        expect(sessionInfoRequests).toHaveLength(1);
        expect(sessionInfoRequests[0].get('x-org-id')).toBe('org_selected');
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
          account_type: 'PRIVATE' as const,
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
      cliUserConfig: { experimentalFeatures: { multi_account: false } },
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
          account_type: 'PRIVATE' as const,
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
    it.scoped('detects the exact existing alias before creating a link', () =>
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

  // ── The typed outcome and the stdout discriminator ──────────────────────────
  //
  // `composio onboard` delegates the connect gate here, so it needs two things the command did not
  // used to provide: a return value that distinguishes "the browser step is outstanding" from "the
  // link never got created", and a way to keep the command's own payloads off a stdout stream the
  // caller owns.

  describe('runConnectedAccountsLink outcome', () => {
    const linkParams = (
      overrides: Partial<Parameters<typeof runConnectedAccountsLink>[0]> = {}
    ) => ({
      toolkit: Option.some('gmail'),
      authConfig: Option.none<string>(),
      userId: Option.none<string>(),
      projectName: Option.none<string>(),
      noWait: true,
      noBrowser: true,
      alias: Option.none<string>(),
      list: false,
      rootOnly: true,
      ...overrides,
    });

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        connectedAccountsData: makeConnectedAccountsData({ items: [] }),
        toolRouter: { create: toolRouterCreateSpy, link: toolRouterLinkSpy },
        fixture: 'global-test-user-id',
      })
    )('[Given] a successful --no-wait link [Then] it returns pending', it => {
      it.scoped('carries the redirect URL and the connected account id', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(linkParams());

          expect(outcome).toStrictEqual({
            kind: 'pending',
            connectedAccountId: 'con_test_link',
            redirectUrl: 'https://app.composio.dev/link?token=lt_test_token',
            toolkit: 'gmail',
          });
        })
      );

      it.scoped('discriminates the pending stdout payload', () =>
        Effect.gen(function* () {
          // MockConsole accumulates across the tests in one layer block.
          yield* Console.clear;
          yield* runConnectedAccountsLink(linkParams());

          const payload = extractJsonObject(
            (yield* MockConsole.getLines({ stripAnsi: true })).join('\n')
          );
          expect(payload?.kind).toBe('connected_account_link');
          expect(payload?.status).toBe('pending');
        })
      );

      it.scoped('writes nothing to stdout with quiet, and returns the same outcome', () =>
        Effect.gen(function* () {
          yield* Console.clear;
          const outcome = yield* runConnectedAccountsLink(linkParams({ quiet: true }));

          expect(outcome).toStrictEqual({
            kind: 'pending',
            connectedAccountId: 'con_test_link',
            redirectUrl: 'https://app.composio.dev/link?token=lt_test_token',
            toolkit: 'gmail',
          });

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).not.toContain('connected_account_link');
          // Decoration still renders — quiet is about stdout, not about the human.
          expect(output).toContain('Redirect URL');
        })
      );
    });

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        // The account the link resolves to is already ACTIVE, so the poll settles on the first
        // `retrieve` instead of walking the retry schedule.
        connectedAccountsData: makeConnectedAccountsData(),
        toolRouter: { create: toolRouterCreateSpy, link: toolRouterLinkSpy },
        fixture: 'global-test-user-id',
      })
    )('[Given] a link that polls to ACTIVE [Then] it returns linked', it => {
      it.scoped('reports the connected account that became active', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(
            linkParams({ noWait: false, quiet: true })
          );

          expect(outcome).toStrictEqual({
            kind: 'linked',
            connectedAccountId: 'con_test_link',
            toolkit: 'gmail',
          });
          expect((yield* MockConsole.getLines({ stripAnsi: true })).join('\n')).not.toContain(
            'connected_account_link'
          );
        })
      );
    });

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        connectedAccountsData: makeConnectedAccountsData({ items: [] }),
        toolRouter: {
          create: toolRouterCreateSpy,
          link: async () => {
            throw Object.assign(new Error('no managed auth'), {
              error: { slug: 'ToolRouterV2_NoManagedAuth', message: 'no managed auth' },
            });
          },
        },
        fixture: 'global-test-user-id',
      })
    )('[Given] a toolkit Composio does not manage [Then] it returns no_managed_auth', it => {
      it.scoped('still shows the dashboard URL as today', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(linkParams());

          expect(outcome).toStrictEqual({ kind: 'not_started', reason: 'no_managed_auth' });

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('does not manage auth');
          expect(output).toContain('Dashboard URL');
        })
      );

      it.scoped('emits the dashboard URL once instead of twice with quiet', () =>
        Effect.gen(function* () {
          yield* Console.clear;
          yield* runConnectedAccountsLink(linkParams({ quiet: true }));

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          // The stderr note survives; only the raw stdout copy of the same URL is gone.
          expect(output).toContain('Dashboard URL');
          expect(output.match(/\/connect\/apps\/gmail/g)).toHaveLength(1);
        })
      );
    });

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        connectedAccountsData: makeConnectedAccountsData({ items: [] }),
        toolRouter: {
          create: toolRouterCreateSpy,
          link: async () => {
            throw new Error('the link endpoint is down');
          },
        },
        fixture: 'global-test-user-id',
      })
    )('[Given] a failing link request [Then] it returns request_failed', it => {
      it.scoped('keeps a retryable failure distinct from an unmanaged toolkit', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(linkParams());

          expect(outcome).toStrictEqual({ kind: 'not_started', reason: 'request_failed' });
        })
      );
    });

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        connectedAccountsData: makeConnectedAccountsData({ items: [] }),
        toolRouter: {
          create: toolRouterCreateSpy,
          link: async () => ({
            connected_account_id: 'con_test_link',
            link_token: 'lt_test_token',
            redirect_url: '',
            account_type: 'PRIVATE' as const,
          }),
        },
        fixture: 'global-test-user-id',
      })
    )('[Given] an incomplete link response [Then] it returns incomplete_response', it => {
      it.scoped('does not report a pending authorization it cannot point at', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(linkParams());

          expect(outcome).toStrictEqual({ kind: 'not_started', reason: 'incomplete_response' });
        })
      );
    });

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        connectedAccountsData: makeConnectedAccountsData({
          items: [makeConnectedAccount({ alias: 'work' })],
        }),
        toolRouter: { create: toolRouterCreateSpy, link: toolRouterLinkSpy },
        fixture: 'global-test-user-id',
      })
    )('[Given] a duplicate alias [Then] it returns alias_conflict', it => {
      it.scoped('never creates the link', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(
            linkParams({ alias: Option.some('work') })
          );

          expect(outcome).toStrictEqual({ kind: 'not_started', reason: 'alias_conflict' });
          expect(toolRouterLinkSpy).not.toHaveBeenCalled();
        })
      );
    });

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        connectedAccountsData: makeConnectedAccountsData(),
        fixture: 'global-test-user-id',
      })
    )('[Given] --list [Then] it reports that no link was attempted', it => {
      it.scoped('distinguishes listing from linking', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(linkParams({ list: true }));

          expect(outcome).toStrictEqual({ kind: 'not_started', reason: 'listed' });
        })
      );
    });

    layer(TestLive({ connectedAccountsData: makeConnectedAccountsData() }))(
      '[Given] no API key [Then] it returns unauthenticated',
      it => {
        it.scoped('never reaches the API', () =>
          Effect.gen(function* () {
            const outcome = yield* runConnectedAccountsLink(linkParams());

            expect(outcome).toStrictEqual({ kind: 'not_started', reason: 'unauthenticated' });
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
    )('[Given] no toolkit and no --auth-config [Then] it returns invalid_arguments', it => {
      it.scoped('reports a usage problem rather than a link failure', () =>
        Effect.gen(function* () {
          const outcome = yield* runConnectedAccountsLink(
            linkParams({ toolkit: Option.none<string>() })
          );

          expect(outcome).toStrictEqual({ kind: 'not_started', reason: 'invalid_arguments' });
        })
      );
    });
  });
});
