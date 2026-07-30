import { describe, expect, layer } from '@effect/vitest';
import { vi } from 'vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { HelpDoc, ValidationError } from '@effect/cli';
import { extendConfigProvider } from 'src/services/config';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';

// never launch a real browser from tests
vi.mock('open', () => ({ default: vi.fn(async () => ({})) }));

const interactiveUI = TerminalUI.of({
  ...terminalUITestImpl,
  capabilities: Effect.succeed({
    stdinIsTTY: true,
    stdoutIsTTY: true,
    stderrIsTTY: true,
    canPrompt: true,
    canDecorate: true,
  }),
  confirm: () => Effect.succeed(true),
  text: () => Effect.succeed(Option.none()),
});

const loggedInConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const gmailAccount: ConnectedAccountItem = {
  id: 'con_onboard_test',
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
};

const extractStateJson = (output: string): Record<string, unknown> => {
  const candidates = output.match(/\{\n {2}"kind": "onboard_state"[\s\S]*?\n\}/g) ?? [];
  expect(candidates.length, `no state JSON found in output:\n${output}`).toBeGreaterThan(0);
  return JSON.parse(candidates[candidates.length - 1]) as Record<string, unknown>;
};

const loginTestOrg = Effect.gen(function* () {
  const userContext = yield* ComposioUserContext;
  yield* userContext.login('test_api_key', 'org_test');
});

describe('CLI: composio onboard (non-interactive contract)', () => {
  layer(TestLive())('logged out', it => {
    it.scoped('[Given] fresh install [Then] emits logged_out state with login as next step', () =>
      Effect.gen(function* () {
        yield* cli(['onboard']);
        const output = (yield* MockConsole.getLines()).join('\n');
        const state = extractStateJson(output);
        expect(state.state).toBe('logged_out');
        expect(state.completed).toEqual([]);
        expect(state.remaining).toEqual(['login', 'connect', 'execute']);
        expect(state.next).toEqual({ step: 'login', cmd: 'composio login' });
      })
    );
  });

  layer(TestLive({ baseConfigProvider: loggedInConfigProvider }))('no connections', it => {
    it.scoped('[Given] no connections [Then] next step is connect with a toolkit suggestion', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard']);
        const output = (yield* MockConsole.getLines()).join('\n');
        const state = extractStateJson(output);
        expect(state.state).toBe('logged_in');
        expect(state.completed).toEqual(['login']);
        expect(state.remaining).toEqual(['connect', 'execute']);
        const next = state.next as { step: string; cmd: string };
        expect(next.step).toBe('connect');
        expect(next.cmd).toContain('composio onboard --toolkit');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: loggedInConfigProvider }))('drives connect', it => {
    it.scoped('[Given] --toolkit [Then] drives the connect step via link --no-wait', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard', '--toolkit', 'github']);
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('"status": "pending"');
        expect(output).toContain('redirect_url');
        expect(output).toContain('"toolkit": "github"');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [{ ...gmailAccount, id: 'con_gh', toolkit: { slug: 'github' } }],
      },
      toolsExecutor: {
        respondWith: {
          successful: true,
          data: { login: 'KJ-11', name: 'Kshitij Jhunjhunwala' },
          error: null,
          logId: 'log_demo',
        },
      },
      terminalUI: interactiveUI,
    })
  )('interactive human summary', it => {
    it.scoped(
      '[Given] connected + interactive menu [Then] shows a summary line, not raw JSON',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          // menu picks the first curated task (github); it is connected, so acknowledge it
          expect(output).toContain('github already connected');
          // pre-run copy announces the tool before the confirm, with a safety note
          expect(output).toContain(
            'Ready — this runs GITHUB_GET_THE_AUTHENTICATED_USER (safe, read-only)'
          );
          // human summary from the demo's summarize(), not a raw JSON dump
          expect(output).toContain("You're @KJ-11 (Kshitij Jhunjhunwala)");
          // the forced raw JSON result must NOT be emitted in interactive mode
          expect(output).not.toContain('"login"');
          expect(output).not.toContain('"successful"');
          // new completion copy: headline + three real example commands + setup tip
          expect(output).toContain('first Composio tool');
          expect(output).toContain('composio search "send myself a test Slack message"');
          expect(output).toContain('composio search "create a GitHub issue in my repo"');
          expect(output).toContain('composio search "what\'s on my calendar today"');
          expect(output).toContain('composio setup');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [{ ...gmailAccount, id: 'con_gh', toolkit: { slug: 'github' } }],
      },
      toolsExecutor: {
        respondWith: {
          successful: false,
          data: {},
          error: 'simulated onboard execution failure',
          logId: 'log_failed_demo',
        },
      },
      terminalUI: interactiveUI,
    })
  )('interactive execution failure stays human-readable', it => {
    it.scoped(
      '[Given] a failed quiet demo [Then] guided errors appear without raw execution JSON',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']).pipe(Effect.catchAll(() => Effect.void));
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('simulated onboard execution failure');
          expect(output).toContain('First run did not succeed');
          expect(output).not.toContain('"kind": "tool_execution"');
          expect(output).not.toContain('"successful": false');
        })
    );
  });

  const menuCapture: { options: ReadonlyArray<{ value: string; label: string }> } = { options: [] };
  const menuCapturingUI = TerminalUI.of({
    ...interactiveUI,
    select: ((_message: string, options: ReadonlyArray<{ value: string; label: string }>) => {
      menuCapture.options = options;
      // decline the run so the flow stops right after the menu without OAuth/execute
      return Effect.succeed(options[0]!.value);
    }) as TerminalUI['select'],
    confirm: () => Effect.succeed(false),
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [gmailAccount] },
      terminalUI: menuCapturingUI,
    })
  )('menu has only curated tasks (no free-text)', it => {
    it.scoped(
      '[Given] interactive menu [Then] every option is a curated task, no "Something else"',
      () =>
        Effect.gen(function* () {
          menuCapture.options = [];
          yield* loginTestOrg;
          yield* cli(['onboard']);
          expect(menuCapture.options.length).toBe(5);
          for (const option of menuCapture.options) {
            expect(option.value).not.toBe('free_text');
          }
          const labels = menuCapture.options.map(o => o.label).join(' | ');
          expect(labels).not.toContain('Something else');
        })
    );
  });

  layer(TestLive({ baseConfigProvider: loggedInConfigProvider }))('rejects unknown --task', it => {
    it.scoped(
      '[Given] --task <nonsense> [Then] a hint lists the curated toolkits, no free-text search',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard', '--task', 'order me a pizza']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('No starter task matches');
          expect(output).toContain('order me a pizza');
          expect(output).toContain('github, gmail, slack, linear, notion');
        })
    );
  });

  const bigEmails = [
    { subject: 'Hello there', snippet: 'the quick brown fox jumps over the lazy dog '.repeat(40) },
    ...Array.from({ length: 200 }, (_, i) => ({
      subject: `Email ${i}`,
      snippet: 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(40),
    })),
  ];

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [gmailAccount] },
      toolsExecutor: {
        respondWith: {
          successful: true,
          data: { messages: bigEmails },
          error: null,
          logId: 'log_gmail',
        },
      },
      terminalUI: interactiveUI,
    })
  )('connected-first menu + no file spill', it => {
    it.scoped(
      '[Given] only gmail connected [Then] the menu picks gmail and a huge result never spills to a file',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          // connected-first ordering: gmail (connected) is chosen over github (first in the registry)
          expect(output).toContain('gmail already connected');
          // gmail summarizer line
          expect(output).toContain("Fetched 201 emails (latest: 'Hello there')");
          // the large payload must NOT be written to a temp file
          expect(output).not.toContain('Response stored in');
          // and the raw snippet text must not be dumped
          expect(output).not.toContain('lorem ipsum');
        })
    );
  });

  layer(TestLive({ baseConfigProvider: loggedInConfigProvider }))('never wires hosts', it => {
    it.scoped('[Given] --yes [Then] onboard never touches agent plugins', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard', '--yes', '--toolkit', 'github']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).not.toContain('Agent plugin');
        expect(output).not.toContain('plugin');
        expect(output).toContain('"status": "pending"');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [{ ...gmailAccount, id: 'con_gh', toolkit: { slug: 'github' } }],
      },
    })
  )('drives read, never offers create non-interactively', it => {
    it.scoped(
      '[Given] connected + --toolkit github [Then] runs the read demo and never prompts to create',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard', '--toolkit', 'github']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('GITHUB_GET_THE_AUTHENTICATED_USER');
          expect(output).not.toContain('Want to try creating');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [gmailAccount] },
    })
  )('named toolkit not connected routes to connect, never executes unlinked', it => {
    it.scoped(
      '[Given] gmail connected + --toolkit github [Then] connects github, never runs a github tool',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard', '--toolkit', 'github']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          // routes to connect the named (unconnected) toolkit
          expect(output).toContain('"status": "pending"');
          expect(output).toContain('"toolkit": "github"');
          // must NOT execute a github tool against an unlinked account
          expect(output).not.toContain('GITHUB_GET_THE_AUTHENTICATED_USER');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [gmailAccount] },
    })
  )('connected, not executed', it => {
    it.scoped(
      '[Given] a connection [Then] next step is execute pointing at the connected app',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.state).toBe('connected');
          expect(state.completed).toEqual(['login', 'connect']);
          expect(state.remaining).toEqual(['execute']);
          expect(state.connections).toMatchObject({ count: 1, toolkits: ['gmail'] });
          expect(state.next).toEqual({
            step: 'execute',
            cmd: 'composio onboard --toolkit gmail',
          });
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [gmailAccount] },
      cliUserConfig: { onboardHasExecuted: true },
    })
  )('complete', it => {
    it.scoped('[Given] all gates satisfied [Then] collapses to a status view and exits 0', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard']);
        const output = (yield* MockConsole.getLines()).join('\n');
        const state = extractStateJson(output);
        expect(state.state).toBe('complete');
        expect(state.remaining).toEqual([]);
        expect(state.next).toBeNull();
        // Returning users must not be congratulated on a first execution.
        expect(output).not.toContain('first Composio tool');
      })
    );

    it.scoped('[Given] --status [Then] shows the same status view', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard', '--status']);
        const output = (yield* MockConsole.getLines()).join('\n');
        const state = extractStateJson(output);
        expect(state.state).toBe('complete');
      })
    );
  });

  layer(TestLive())('validation', it => {
    it.scoped('[Given] an invalid --skip value [Then] fails with an actionable message', () =>
      Effect.gen(function* () {
        const result = yield* cli(['onboard', '--skip', 'nonsense']).pipe(
          Effect.catchAll(error => Effect.succeed(error))
        );
        expect(ValidationError.isValidationError(result)).toBe(true);
        const message = HelpDoc.toAnsiText((result as ValidationError.ValidationError).error);
        expect(message).toContain('Invalid --skip value');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: loggedInConfigProvider }))('skips', it => {
    it.scoped('[Given] --skip connect [Then] nothing is actionable and skip is recorded', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard', '--skip', 'connect']);
        const output = (yield* MockConsole.getLines()).join('\n');
        const state = extractStateJson(output);
        expect(state.state).toBe('logged_in');
        expect(state.skipped).toEqual(['connect']);
        expect(state.next).toBeNull();
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      cliUserConfig: { onboardSkippedSteps: ['connect'] },
    })
  )('persisted connect skip is a record, not a block', it => {
    it.scoped(
      '[Given] persisted connect skip + bare run [Then] connect is not both skipped and next',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          // persisted skips are a record, not a block: connect is still the next step
          expect(state.skipped).toEqual([]);
          expect(state.persisted_skips).toEqual(['connect']);
          const next = state.next as { step: string } | null;
          expect(next?.step).toBe('connect');
          // the contradiction is gone: connect never appears in both skipped and next/remaining
          expect(state.skipped).not.toContain('connect');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [{ ...gmailAccount, id: 'con_sf', toolkit: { slug: 'salesforce' } }],
      },
    })
  )('execute-gate next never recommends a non-curated toolkit', it => {
    it.scoped(
      '[Given] only a non-curated connection [Then] next recommends a progressing command',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.state).toBe('connected');
          const next = state.next as { step: string; cmd: string };
          expect(next.step).toBe('execute');
          // must NOT loop by suggesting --toolkit for the non-curated toolkit
          expect(next.cmd).not.toContain('salesforce');
          expect(next.cmd).not.toContain('--toolkit');
          expect(next.cmd).toContain('composio search');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [
          { ...gmailAccount, id: 'con_sf', toolkit: { slug: 'salesforce' } },
          { ...gmailAccount, id: 'con_gh', toolkit: { slug: 'github' } },
        ],
      },
    })
  )('execute-gate next prefers a curated connected toolkit', it => {
    it.scoped(
      '[Given] a curated connection among non-curated ones [Then] next targets the curated one',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          const next = state.next as { step: string; cmd: string };
          expect(next.step).toBe('execute');
          expect(next.cmd).toBe('composio onboard --toolkit github');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      cliUserConfig: { onboardHasExecuted: true },
      connectedAccountsData: { listShouldFail: true },
    })
  )('failed connection check with prior completion', it => {
    it.scoped(
      '[Given] a transient API failure + prior has_executed [Then] stays complete, never reconnect',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.state).toBe('complete');
          expect(state.next).toBeNull();
          expect(state.connections).toMatchObject({ check_failed: true });
          // must not push a completed user back into connect/OAuth
          expect(output).not.toContain('"step": "connect"');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { listShouldFail: true },
    })
  )('failed connection check without prior evidence', it => {
    it.scoped(
      '[Given] a transient API failure + no prior completion [Then] signals failure, does not route to connect',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.connections).toMatchObject({ check_failed: true });
          expect(state.next).toBeNull();
          const next = state.next as { step: string } | null;
          expect(next?.step).not.toBe('connect');
          // an unknown connection is never listed as actionable/skipped
          expect(state.remaining).not.toContain('connect');
          expect(state.remaining).not.toContain('execute');
          expect(state.skipped).not.toContain('connect');
          expect(state.skipped).not.toContain('execute');
          expect(output).not.toContain('were skipped');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { listShouldFail: true },
    })
  )('status view on a failed connection check', it => {
    it.scoped(
      '[Given] --status + a transient API failure [Then] the outro reports the API failure, not a skip',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard', '--status']);
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain("Couldn't reach the Composio API");
          expect(output).not.toContain('were skipped');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      cliUserConfig: { onboardHasExecuted: true, onboardOrgId: 'org_other' },
      connectedAccountsData: { listShouldFail: true },
    })
  )('failed connection check with completion earned in another org', it => {
    it.scoped(
      '[Given] a transient API failure + has_executed earned in a different org [Then] never reports complete',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.state).not.toBe('complete');
          expect(state.connections).toMatchObject({ check_failed: true });
          expect(state.next).toBeNull();
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      cliUserConfig: { onboardHasExecuted: true, onboardOrgId: 'org_other' },
      connectedAccountsData: { items: [gmailAccount] },
    })
  )('healthy connection check with completion earned in another org', it => {
    it.scoped(
      '[Given] an active connection + has_executed earned in a different org [Then] requires execution',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.state).toBe('connected');
          expect(state.completed).toEqual(['login', 'connect']);
          expect(state.next).toMatchObject({ step: 'execute' });
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [
          {
            ...gmailAccount,
            id: 'con_slack_pending',
            status: 'INITIATED',
            toolkit: { slug: 'slack' },
          },
        ],
      },
    })
  )('pending OAuth resumes the same toolkit', it => {
    it.scoped(
      '[Given] a slack account mid-OAuth (INITIATED) [Then] next.cmd resumes slack, not github',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.state).toBe('logged_in');
          expect(state.connections).toMatchObject({ count: 0 });
          expect(state.next).toEqual({
            step: 'connect',
            cmd: 'composio onboard --toolkit slack',
          });
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [{ ...gmailAccount, id: 'con_gh', toolkit: { slug: 'github' } }],
      },
      toolsExecutor: {
        respondWith: {
          successful: true,
          data: { login: 'KJ-11' },
          error: null,
          logId: 'log_demo',
        },
      },
      cliUserConfig: {
        onboardHasExecuted: true,
        onboardOrgId: 'org_other',
        updateShouldFail: true,
      },
    })
  )('persist failure surfaces in the emitted JSON', it => {
    it.scoped(
      '[Given] another org completed + this org cannot persist [Then] JSON reports a stop hint',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard', '--toolkit', 'github']);
          const output = (yield* MockConsole.getLines()).join('\n');
          const state = extractStateJson(output);
          expect(state.state).toBe('complete');
          expect(state.next).toBeNull();
          expect(state.hint).toContain('saving onboarding progress failed');
          expect(state.hint).toContain('do not re-run');
        })
    );
  });

  const escapeInjectionUI = TerminalUI.of({
    ...terminalUITestImpl,
    capabilities: Effect.succeed({
      stdinIsTTY: true,
      stdoutIsTTY: true,
      stderrIsTTY: true,
      canPrompt: true,
      canDecorate: true,
    }),
    confirm: () => Effect.succeed(true),
    text: () => Effect.succeed(Option.none()),
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [gmailAccount] },
      toolsExecutor: {
        respondWith: {
          successful: true,
          data: { messages: [{ subject: 'Innocent\u001b]0;pwned\u0007 subject' }] },
          error: null,
          logId: 'log_gmail',
        },
      },
      terminalUI: escapeInjectionUI,
    })
  )('summarizer strips terminal escapes', it => {
    it.scoped(
      '[Given] an API-controlled subject with C0/OSC bytes [Then] the summary line is stripped',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain("latest: 'Innocent]0;pwned subject'");
          expect(output).not.toContain('\u001b]0;');
          expect(output).not.toContain('\u0007');
        })
    );
  });

  const veteranReconnectAccounts: { items: ConnectedAccountItem[] } = { items: [] };
  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      cliUserConfig: { onboardHasExecuted: true, onboardOrgId: 'org_test' },
      connectedAccountsData: veteranReconnectAccounts,
      toolRouter: {
        link: async () => {
          veteranReconnectAccounts.items.push({
            ...gmailAccount,
            id: 'con_test_link',
            toolkit: { slug: 'github' },
          });
          return {
            connected_account_id: 'con_test_link',
            link_token: 'lt_test_token',
            redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
            account_type: 'PRIVATE' as const,
          };
        },
      },
      terminalUI: interactiveUI,
    })
  )('reconnecting veteran never re-runs the first execution', it => {
    it.scoped(
      '[Given] has_executed + a lost connection [When] the veteran reconnects [Then] no demo re-run, no re-celebration',
      () =>
        Effect.gen(function* () {
          veteranReconnectAccounts.items.length = 0;
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('Connection successful');
          expect(output).toContain('already run your first tool');
          expect(output).not.toContain('Ready — this runs');
          expect(output).not.toContain('first Composio tool');
          expect(output).not.toContain('Want to try creating');
        })
    );
  });

  const embeddedLoginFetch = async (
    requestInput: RequestInfo | URL,
    _init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof requestInput === 'string'
        ? requestInput
        : requestInput instanceof URL
          ? requestInput.toString()
          : requestInput.url;
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.includes('/api/v3/auth/session/info')) {
      return json({
        project: {
          name: 'Default Project',
          id: 'project_id_default',
          org_id: 'org_test',
          nano_id: 'project_default',
          email: 'project@example.com',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          org: { id: 'org_test', name: 'Example Org', plan: 'enterprise' },
        },
        org_member: {
          id: 'member_123',
          user_id: 'user_123',
          email: 'cli@example.com',
          name: 'CLI User',
          role: 'admin',
        },
        api_key: null,
      });
    }
    if (url.includes('/api/v3/org/consumer/project/resolve')) {
      return json({
        project_id: 'consumer_project_id_test',
        project_nano_id: 'consumer_project_test',
        project_name: 'Consumer Project',
        org_id: 'org_test',
        project_type: 'CONSUMER',
        consumer_user_id: 'consumer-user-org_test',
      });
    }
    return json({});
  };

  layer(
    TestLive({
      sessionsData: { status: 'linked', apiKey: 'uak_embedded_test' },
      connectedAccountsData: {
        items: [{ ...gmailAccount, id: 'con_gh', toolkit: { slug: 'github' } }],
      },
      toolsExecutor: {
        respondWith: {
          successful: true,
          data: { login: 'KJ-11' },
          error: null,
          logId: 'log_demo',
        },
      },
      terminalUI: interactiveUI,
    })
  )('interactive embedded login', it => {
    it.scoped(
      '[Given] a logged-out TTY [Then] onboard logs in embedded (no hints/JSON/outro) and completes',
      () =>
        Effect.gen(function* () {
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(embeddedLoginFetch);
          try {
            yield* cli(['onboard', '--yes']);
          } finally {
            fetchSpy.mockRestore();
          }
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          yield* Effect.map(ComposioUserContext, ctx => {
            expect(ctx.isLoggedIn()).toBe(true);
          });
          expect(output).toContain('Log in to Composio');
          expect(output).toContain('Logged in as test.name@gmail.com');
          expect(output).not.toContain('Execute a tool directly');
          expect(output).not.toContain('Switch your current org');
          expect(output).not.toContain('"org_name"');
          expect(output).not.toContain("You're all set!");
          expect(output).toContain('first Composio tool');
        })
    );
  });

  const followUpArgs = ['composiohq', 'composio', 'Test issue from onboard'];
  const followUpState: { textCalls: number; executed: Array<Record<string, unknown>> } = {
    textCalls: 0,
    executed: [],
  };
  const followUpUI = TerminalUI.of({
    ...interactiveUI,
    text: () =>
      Effect.sync(() => {
        const value = followUpArgs[followUpState.textCalls];
        followUpState.textCalls += 1;
        return Option.fromNullable(value);
      }),
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: {
        items: [{ ...gmailAccount, id: 'con_gh', toolkit: { slug: 'github' } }],
      },
      toolRouter: {
        execute: async (_sessionId, params) => {
          followUpState.executed.push({ slug: params.tool_slug, arguments: params.arguments });
          return {
            data: { number: 42, title: 'Test issue from onboard' },
            error: null,
            log_id: 'log_followup',
          };
        },
      },
      terminalUI: followUpUI,
    })
  )('follow-up create runs with prompted args', it => {
    it.scoped(
      '[Given] the user accepts the create offer and answers the prompts [Then] the create tool runs with those args',
      () =>
        Effect.gen(function* () {
          followUpState.textCalls = 0;
          followUpState.executed.length = 0;
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('Creating with GITHUB_CREATE_AN_ISSUE');
          expect(output).toContain('Remember to close/archive it');
          expect(followUpState.executed.map(call => call.slug)).toEqual([
            'GITHUB_GET_THE_AUTHENTICATED_USER',
            'GITHUB_CREATE_AN_ISSUE',
          ]);
          expect(followUpState.executed[1]!.arguments).toMatchObject({
            owner: 'composiohq',
            repo: 'composio',
            title: 'Test issue from onboard',
          });
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      toolRouter: {
        link: async () => {
          throw new Error('simulated link failure');
        },
      },
    })
  )('soft link failure keeps the agent contract', it => {
    it.scoped(
      '[Given] --toolkit github + a failing link [Then] emits state JSON with a retry hint instead of exiting silently',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard', '--toolkit', 'github']);
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).not.toContain('"status": "pending"');
          const state = extractStateJson(output);
          expect(state.state).toBe('logged_in');
          expect(state.hint).toContain('Could not create a connection link for "github"');
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      toolRouter: {
        link: async () => {
          throw new Error('simulated link failure');
        },
      },
      terminalUI: interactiveUI,
    })
  )('interactive soft link failure', it => {
    it.scoped(
      '[Given] the link cannot be created [Then] the outro says so instead of claiming an OAuth wait',
      () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('The connection for "github" was not created');
          expect(output).not.toContain('Finish authorizing');
        })
    );
  });
});
