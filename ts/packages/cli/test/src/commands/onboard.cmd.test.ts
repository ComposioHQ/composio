import { describe, expect, layer } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import { HelpDoc, ValidationError } from '@effect/cli';
import { ConfigProvider, Console, Effect, Option } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { CommandExecutor } from '@effect/platform';
import { extendConfigProvider } from 'src/services/config';
import { CommandRunner } from 'src/services/command-runner';
import { TerminalUI } from 'src/services/terminal-ui';
import { onboardStateDocument, serializeOnboardState } from 'src/commands/onboard-render';
import * as loginCmd from 'src/commands/login.cmd';
import * as linkCmd from 'src/commands/connected-accounts/commands/connected-accounts.link.cmd';
import * as executeCmd from 'src/commands/tools/commands/tools.execute.cmd';
import type { RunToolsExecuteResult } from 'src/commands/tools/commands/tools.execute.cmd';
import * as commandProject from 'src/services/command-project';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { makeTerminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import type { TerminalUITestOptions } from 'test/__utils__/services/terminal-ui-test';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

vi.mock('open', () => ({ default: vi.fn(async () => undefined) }));

const CONSUMER_USER_ID = 'consumer-user-org_test';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

/** Exit 127 is "command not found", so the host-wiring probe finds no agent host. */
const noHostsRunner = new CommandRunner({
  run: () => Effect.succeed(CommandExecutor.ExitCode(127)),
  capture: () => Effect.succeed({ exitCode: 127, stdout: '', stderr: 'command not found' }),
});

const account = (
  overrides: Partial<ConnectedAccountItem> & Pick<ConnectedAccountItem, 'id' | 'status'>
): ConnectedAccountItem => ({
  alias: null,
  word_id: null,
  status_reason: null,
  is_disabled: false,
  user_id: CONSUMER_USER_ID,
  toolkit: { slug: 'github' },
  auth_config: {
    id: 'ac_oauth',
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_disabled: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  test_request_endpoint: '',
  ...overrides,
});

/**
 * A recording TerminalUI that keeps stdout and stderr apart.
 *
 * One `Console` cannot express two streams, and the whole point of the mode matrix is which stream
 * a value landed on — so the double records `output` calls separately while still honouring the real
 * `force` / stdout-TTY rule.
 */
const recordingUI = (options: TerminalUITestOptions = {}) => {
  const base = makeTerminalUITestImpl(options);
  const stdout: Array<string> = [];

  const ui = TerminalUI.of({
    ...base,
    output: (data, outputOptions) =>
      Effect.gen(function* () {
        const capabilities = yield* base.capabilities;
        if (outputOptions?.force || !capabilities.stdoutIsTTY) {
          stdout.push(data);
        }
        // Deliberately not forwarded to Console: stderr assertions read MockConsole, and mixing the
        // two back together is what makes "which stream was this on?" untestable.
      }),
  });

  return { ui, stdout, reset: () => void stdout.splice(0, stdout.length) };
};

type Doc = ReturnType<typeof onboardStateDocument>;

const parseDocuments = (stdout: ReadonlyArray<string>): Array<Doc> =>
  stdout.map(entry => JSON.parse(entry) as Doc);

/** Parses the whole stream, so a leaked second write fails instead of being silently ignored. */
const soleDocument = (stdout: ReadonlyArray<string>): Doc => {
  const documents = parseDocuments(stdout);
  expect(documents).toHaveLength(1);
  return documents[0]!;
};

/**
 * `runToolsExecute` infers a narrower union than it declares, so a hand-built stand-in does not
 * structurally match any single branch. One cast here keeps the mocks readable and still type-checks
 * the value against the command's own published result type.
 */
const mockedExecute = (result: RunToolsExecuteResult) =>
  Effect.succeed(result) as ReturnType<typeof executeCmd.runToolsExecute>;

const liveInput = (
  overrides: Partial<TestLiveInput> & { terminalUI: TestLiveInput['terminalUI'] }
): TestLiveInput => ({
  baseConfigProvider: testConfigProvider,
  fixture: 'global-test-user-id',
  commandRunner: noHostsRunner,
  ...overrides,
});

describe('CLI: composio onboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Usage errors (Table B, S14) ─────────────────────────────────────────────

  layer(TestLive({ commandRunner: noHostsRunner }))(it => {
    it.scoped('[Given] --toolkit "" [Then] fails with a validation error and no document', () =>
      Effect.gen(function* () {
        const error = yield* cli(['onboard', '--toolkit', '']).pipe(Effect.flip);

        expect(ValidationError.isValidationError(error)).toBe(true);
        if (!ValidationError.isValidationError(error)) return;
        expect(HelpDoc.toAnsiText(error.error)).toContain('`--toolkit` cannot be empty.');
      })
    );

    it.scoped('[Given] --task "" [Then] fails with a validation error', () =>
      Effect.gen(function* () {
        const error = yield* cli(['onboard', '--task', '  ']).pipe(Effect.flip);

        expect(ValidationError.isValidationError(error)).toBe(true);
        if (!ValidationError.isValidationError(error)) return;
        expect(HelpDoc.toAnsiText(error.error)).toContain('`--task` cannot be empty.');
      })
    );

    it.scoped('[Given] --skip bogus [Then] fails as a usage error', () =>
      Effect.gen(function* () {
        const error = yield* cli(['onboard', '--skip', 'bogus']).pipe(Effect.flip);

        expect(ValidationError.isValidationError(error)).toBe(true);
      })
    );

    it.scoped('[Given] --skip login [Then] fails as a usage error', () =>
      Effect.gen(function* () {
        // Skipping login would leave every later gate underivable, so it is not a state.
        const error = yield* cli(['onboard', '--skip', 'login']).pipe(Effect.flip);

        expect(ValidationError.isValidationError(error)).toBe(true);
      })
    );
  });

  layer(TestLive({ commandRunner: noHostsRunner }))(it => {
    it.scoped('[Given] --help [Then] lists the flags an agent needs', () =>
      Effect.gen(function* () {
        yield* cli(['onboard', '--help']);

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('--json');
        expect(output).toContain('--status');
        expect(output).toContain('--yes');
        expect(output).toContain('--toolkit');
        expect(output).not.toContain('Usage: composio [');
      })
    );
  });

  // ── Table C: the four invocation modes ──────────────────────────────────────

  describe('Table C — the only mode-dependent divergences', () => {
    const loggedOut = { commandRunner: noHostsRunner };

    describe('piped (no --json): the document reaches stdout', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(TestLive({ ...loggedOut, terminalUI: recorded.ui }))(it => {
        it.scoped('emits the document and issues no prompt', () =>
          Effect.gen(function* () {
            recorded.reset();
            const selectSpy = vi.spyOn(recorded.ui, 'select');

            yield* cli(['onboard']);

            const document = soleDocument(recorded.stdout);
            expect(document.kind).toBe('onboard_state');
            expect(document.v).toBe(2);
            expect(document.next_gate).toBe('login');
            expect(selectSpy).not.toHaveBeenCalled();
          })
        );
      });
    });

    describe('non-prompting on a TTY: stderr speaks, stdout stays clean', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: true, stderr: true } });

      layer(TestLive({ ...loggedOut, terminalUI: recorded.ui }))(it => {
        it.scoped('is not silent — the human renderer still runs', () =>
          Effect.gen(function* () {
            recorded.reset();
            yield* Console.clear;

            yield* cli(['onboard']);

            // The reason to withhold the document is that stdout is a terminal, not that there is
            // nothing to say. This is the mode an earlier build made completely silent.
            expect(recorded.stdout).toEqual([]);
            expect((yield* MockConsole.getLines({ stripAnsi: true })).join('\n').trim()).not.toBe(
              ''
            );
          })
        );

        it.scoped('puts the document on stdout when --json asks for it', () =>
          Effect.gen(function* () {
            recorded.reset();

            yield* cli(['onboard', '--json']);

            expect(soleDocument(recorded.stdout).kind).toBe('onboard_state');
          })
        );
      });
    });

    describe('--json on a pty: forced document, no prompts', () => {
      const recorded = recordingUI({ tty: { stdin: true, stdout: true, stderr: true } });

      layer(TestLive({ ...loggedOut, terminalUI: recorded.ui }))(it => {
        it.scoped('suppresses prompts by branching on the flag, not on a stream', () =>
          Effect.gen(function* () {
            recorded.reset();
            const selectSpy = vi.spyOn(recorded.ui, 'select');
            const confirmSpy = vi.spyOn(recorded.ui, 'confirm');
            const textSpy = vi.spyOn(recorded.ui, 'text');

            yield* cli(['onboard', '--json']);

            expect(soleDocument(recorded.stdout).kind).toBe('onboard_state');
            expect(selectSpy).not.toHaveBeenCalled();
            expect(confirmSpy).not.toHaveBeenCalled();
            expect(textSpy).not.toHaveBeenCalled();
          })
        );
      });
    });

    describe('interactive: no document on a terminal stdout', () => {
      const recorded = recordingUI({ tty: { stdin: true, stdout: true, stderr: true } });

      layer(TestLive({ ...loggedOut, terminalUI: recorded.ui }))(it => {
        it.scoped('withholds the document without --json', () =>
          Effect.gen(function* () {
            recorded.reset();
            // Stubbed so the test does not sit in the real browser poll; the assertion is about
            // which stream the document lands on, not about the login round trip.
            vi.spyOn(loginCmd, 'browserLogin').mockReturnValue(
              Effect.succeed({
                status: 'pending',
                loginUrl: 'https://app.composio.dev/l/abc',
                pollCommand: 'composio login --poll',
              })
            );

            yield* cli(['onboard']);

            expect(recorded.stdout).toEqual([]);
          })
        );
      });
    });
  });

  // ── R8: the disagreement test ───────────────────────────────────────────────

  describe('R8 — gates and onboarded are identical across modes', () => {
    const FACT_SETS = [
      { name: 'logged out', items: [] as ReadonlyArray<ConnectedAccountItem>, executed: false },
      {
        name: 'connected, never executed',
        items: [account({ id: 'con_github', status: 'ACTIVE' })],
        executed: false,
      },
      {
        name: 'connected and executed',
        items: [account({ id: 'con_github', status: 'ACTIVE' })],
        executed: true,
      },
      {
        name: 'authorization outstanding',
        items: [account({ id: 'con_github_pending', status: 'INITIATED' })],
        executed: false,
      },
    ] as const;

    for (const facts of FACT_SETS) {
      const piped = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });
      const json = recordingUI({ tty: { stdin: true, stdout: true, stderr: true } });

      const inputFor = (terminalUI: TestLiveInput['terminalUI']): TestLiveInput =>
        liveInput({
          terminalUI,
          connectedAccountsData: { items: [...facts.items] },
          cliUserConfig: facts.executed
            ? {
                onboarding: {
                  hasExecuted: true,
                  lastExecution: { slug: 'GITHUB_GET_THE_AUTHENTICATED_USER', at: '2026-07-01Z' },
                },
              }
            : undefined,
        });

      layer(TestLive(inputFor(piped.ui)))(it => {
        it.scoped(`[${facts.name}] piped mode resolves the gates`, () =>
          Effect.gen(function* () {
            piped.reset();
            // `--status` so the comparison is over resolution, not over what each mode advanced.
            yield* cli(['onboard', '--status', '--toolkit', 'github']);
            expect(piped.stdout).toHaveLength(1);
          })
        );
      });

      layer(TestLive(inputFor(json.ui)))(it => {
        it.scoped(`[${facts.name}] --json mode agrees about gates and onboarded`, () =>
          Effect.gen(function* () {
            json.reset();
            yield* cli(['onboard', '--status', '--json', '--toolkit', 'github']);

            const jsonDocument = soleDocument(json.stdout);
            const pipedDocument = soleDocument(piped.stdout);

            expect(jsonDocument.gates).toStrictEqual(pipedDocument.gates);
            expect(jsonDocument.onboarded).toBe(pipedDocument.onboarded);
            expect(jsonDocument.next_gate).toBe(pipedDocument.next_gate);
          })
        );
      });
    }
  });

  // ── Door A: the first execute ───────────────────────────────────────────────

  describe('Door A — the read demo fires only when the caller named the target', () => {
    const connected = [account({ id: 'con_github', status: 'ACTIVE' })];

    describe('--json with no toolkit argument', () => {
      const recorded = recordingUI({ tty: { stdin: true, stdout: true, stderr: true } });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('never calls runToolsExecute', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');

            yield* cli(['onboard', '--json']);

            expect(executeSpy).not.toHaveBeenCalled();

            // The toolkit is resolved (there is a live account for it), so onboard hands the caller
            // a real command instead of blocking — it just refuses to run the read itself.
            const document = soleDocument(recorded.stdout);
            expect(document.next_gate).toBe('execute');
            expect(document.next_command).toContain('GITHUB_GET_THE_AUTHENTICATED_USER');
            expect(document.next_command).not.toContain('<');
          })
        );
      });
    });

    describe('--json with no toolkit and nothing connected', () => {
      const recorded = recordingUI({ tty: { stdin: true, stdout: true, stderr: true } });

      layer(TestLive(liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: [] } })))(
        it => {
          it.scoped('blocks on toolkit_required with the curated slugs as data', () =>
            Effect.gen(function* () {
              recorded.reset();
              const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');
              const linkSpy = vi.spyOn(linkCmd, 'runConnectedAccountsLink');

              yield* cli(['onboard', '--json']);

              expect(executeSpy).not.toHaveBeenCalled();
              expect(linkSpy).not.toHaveBeenCalled();

              const document = soleDocument(recorded.stdout);
              expect(document.blocked).toBe(true);
              expect(document.blocked_reason).toBe('toolkit_required');
              // Data, not a `--toolkit <slug>` template an agent would exec verbatim.
              expect(document.next_command).toBeNull();
              expect(document.available_toolkits).toContain('github');
              expect(document.available_toolkits).toContain('gmail');
            })
          );
        }
      );
    });

    describe('piped with no toolkit argument', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('never calls runToolsExecute', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');

            yield* cli(['onboard']);

            expect(executeSpy).not.toHaveBeenCalled();
          })
        );
      });
    });

    describe('--json --toolkit github', () => {
      const recorded = recordingUI({ tty: { stdin: true, stdout: true, stderr: true } });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('runs the demo quietly and inline, in that mode too', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute').mockReturnValue(
              mockedExecute({
                kind: 'tool_execution',
                successful: true,
                slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
                data: { login: 'jkomyno' },
              })
            );

            yield* cli(['onboard', '--json', '--toolkit', 'github']);

            expect(executeSpy).toHaveBeenCalledTimes(1);
            expect(executeSpy.mock.calls[0]?.[0]).toMatchObject({
              slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
              // Load-bearing, not tidiness: without them the raw provider response lands on the
              // same stdout as the document, and the response size decides the delegate's shape.
              quiet: true,
              inlineOnly: true,
            });
            expect(soleDocument(recorded.stdout).kind).toBe('onboard_state');
          })
        );
      });
    });

    describe('an unsatisfied connect gate', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(TestLive(liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: [] } })))(
        it => {
          it.scoped('never attempts the execute gate', () =>
            Effect.gen(function* () {
              recorded.reset();
              const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');
              const linkSpy = vi
                .spyOn(linkCmd, 'runConnectedAccountsLink')
                .mockReturnValue(
                  Effect.succeed({ kind: 'not_started', reason: 'request_failed' as const })
                );

              yield* cli(['onboard', '--toolkit', 'github']);

              expect(linkSpy).toHaveBeenCalledTimes(1);
              expect(executeSpy).not.toHaveBeenCalled();
            })
          );
        }
      );
    });

    describe('a blocked connect gate', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(
        TestLive(
          liveInput({
            terminalUI: recorded.ui,
            connectedAccountsData: {
              items: [account({ id: 'con_github_pending', status: 'INITIATED' })],
            },
          })
        )
      )(it => {
        it.scoped('never links again and never executes', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');
            const linkSpy = vi.spyOn(linkCmd, 'runConnectedAccountsLink');

            yield* cli(['onboard', '--toolkit', 'github']);

            expect(linkSpy).not.toHaveBeenCalled();
            expect(executeSpy).not.toHaveBeenCalled();

            const document = soleDocument(recorded.stdout);
            expect(document.gates.connect.status).toBe('blocked');
            expect(document.blocked).toBe(true);
            expect(document.blocked_reason).toBe('browser_authorization_required');
            // A command here would reproduce the same state and loop the agent.
            expect(document.next_command).toBeNull();
          })
        );
      });
    });

    describe('an unknown connect gate', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(TestLive(liveInput({ terminalUI: recorded.ui })))(it => {
        it.scoped('exits zero with blocked rather than inviting a retry loop', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');
            // The connection check fails because the consumer project cannot be resolved, which is
            // what `connectedToolkits: 'unknown'` is for.
            vi.spyOn(commandProject, 'resolveCommandProject').mockReturnValue(
              Effect.die('the API is unreachable')
            );

            yield* cli(['onboard', '--toolkit', 'github']);

            expect(executeSpy).not.toHaveBeenCalled();
            const document = soleDocument(recorded.stdout);
            expect(document.gates.connect.status).toBe('unknown');
            expect(document.blocked_reason).toBe('connection_check_failed');
            expect(document.next_command).toBeNull();
          })
        );
      });
    });
  });

  // ── Door B: the optional reversible create ──────────────────────────────────

  describe('Door B — the create can never fire with no human watching', () => {
    const connected = [account({ id: 'con_github', status: 'ACTIVE' })];
    const readSucceeded = {
      kind: 'tool_execution' as const,
      successful: true as const,
      slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
      data: { login: 'jkomyno' },
    };

    describe('with --json', () => {
      const recorded = recordingUI({
        tty: { stdin: true, stdout: true, stderr: true },
        confirmAnswers: [true],
        textAnswers: ['owner', 'repo', 'title'],
      });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('never issues the create confirm', () =>
          Effect.gen(function* () {
            recorded.reset();
            const confirmSpy = vi.spyOn(recorded.ui, 'confirm');
            const executeSpy = vi
              .spyOn(executeCmd, 'runToolsExecute')
              .mockReturnValue(mockedExecute(readSucceeded));

            yield* cli(['onboard', '--json', '--toolkit', 'github']);

            expect(confirmSpy).not.toHaveBeenCalled();
            expect(executeSpy).toHaveBeenCalledTimes(1);
            expect(executeSpy.mock.calls[0]?.[0].slug).not.toBe('GITHUB_CREATE_AN_ISSUE');
          })
        );
      });
    });

    describe('when prompting is unavailable', () => {
      const recorded = recordingUI({
        tty: { stdin: false, stdout: false, stderr: true },
        confirmAnswers: [true],
        textAnswers: ['owner', 'repo', 'title'],
      });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('never calls the create tool', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi
              .spyOn(executeCmd, 'runToolsExecute')
              .mockReturnValue(mockedExecute(readSucceeded));

            yield* cli(['onboard', '--toolkit', 'github']);

            const slugs = executeSpy.mock.calls.map(call => call[0].slug);
            expect(slugs).not.toContain('GITHUB_CREATE_AN_ISSUE');
          })
        );
      });
    });

    describe('when --yes is passed', () => {
      const recorded = recordingUI({
        tty: { stdin: true, stdout: true, stderr: true },
        // No scripted confirm answer, so the create confirm falls back to its `false` default.
        textAnswers: ['owner', 'repo', 'title'],
      });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('does not authorize the write', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi
              .spyOn(executeCmd, 'runToolsExecute')
              .mockReturnValue(mockedExecute(readSucceeded));

            yield* cli(['onboard', '--yes', '--toolkit', 'github']);

            const slugs = executeSpy.mock.calls.map(call => call[0].slug);
            expect(slugs).not.toContain('GITHUB_CREATE_AN_ISSUE');
          })
        );
      });
    });

    describe('when the confirm is declined', () => {
      const recorded = recordingUI({
        tty: { stdin: true, stdout: true, stderr: true },
        confirmAnswers: [false],
        textAnswers: ['owner', 'repo', 'title'],
      });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('leaves onboarding complete anyway', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi
              .spyOn(executeCmd, 'runToolsExecute')
              .mockReturnValue(mockedExecute(readSucceeded));

            yield* cli(['onboard', '--toolkit', 'github', '--json']);

            const slugs = executeSpy.mock.calls.map(call => call[0].slug);
            expect(slugs).not.toContain('GITHUB_CREATE_AN_ISSUE');
          })
        );
      });
    });

    describe('when a required argument prompt is cancelled', () => {
      const recorded = recordingUI({
        tty: { stdin: true, stdout: true, stderr: true },
        confirmAnswers: [true],
        // Only two of the three required answers: the third resolves to None.
        textAnswers: ['acme', 'app'],
      });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('aborts the create and makes no partial call', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi
              .spyOn(executeCmd, 'runToolsExecute')
              .mockReturnValue(mockedExecute(readSucceeded));

            yield* cli(['onboard', '--toolkit', 'github']);

            const slugs = executeSpy.mock.calls.map(call => call[0].slug);
            expect(slugs).not.toContain('GITHUB_CREATE_AN_ISSUE');
          })
        );
      });
    });

    describe('when every condition is met', () => {
      const recorded = recordingUI({
        tty: { stdin: true, stdout: true, stderr: true },
        confirmAnswers: [true],
        textAnswers: ['acme', 'app', 'Hello from Composio'],
      });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped('creates the issue from prompted arguments only', () =>
          Effect.gen(function* () {
            recorded.reset();
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute').mockImplementation(params =>
              mockedExecute({
                kind: 'tool_execution',
                successful: true,
                slug: params.slug,
                data: { html_url: 'https://github.com/acme/app/issues/1' },
              })
            );

            yield* cli(['onboard', '--toolkit', 'github']);

            const createCall = executeSpy.mock.calls.find(
              call => call[0].slug === 'GITHUB_CREATE_AN_ISSUE'
            );
            expect(createCall).toBeDefined();
            expect(JSON.parse(Option.getOrThrow(createCall![0].data))).toStrictEqual({
              owner: 'acme',
              repo: 'app',
              title: 'Hello from Composio',
            });
          })
        );
      });
    });
  });

  // ── --status (R14) ──────────────────────────────────────────────────────────

  describe('--status never advances a gate', () => {
    const connected = [account({ id: 'con_github', status: 'ACTIVE' })];

    for (const mode of [
      {
        name: 'interactive',
        tty: { stdin: true, stdout: true, stderr: true },
        argv: ['onboard', '--status', '--toolkit', 'github'],
      },
      {
        name: '--json',
        tty: { stdin: true, stdout: true, stderr: true },
        argv: ['onboard', '--status', '--json', '--toolkit', 'github'],
      },
      {
        name: 'piped',
        tty: { stdin: false, stdout: false, stderr: true },
        argv: ['onboard', '--status', '--toolkit', 'github'],
      },
    ] as const) {
      const recorded = recordingUI({ tty: mode.tty });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: connected } })
        )
      )(it => {
        it.scoped(`calls no delegate in ${mode.name} mode`, () =>
          Effect.gen(function* () {
            recorded.reset();
            const loginSpy = vi.spyOn(loginCmd, 'browserLogin');
            const linkSpy = vi.spyOn(linkCmd, 'runConnectedAccountsLink');
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');

            yield* cli([...mode.argv]);

            expect(loginSpy).not.toHaveBeenCalled();
            expect(linkSpy).not.toHaveBeenCalled();
            expect(executeSpy).not.toHaveBeenCalled();
          })
        );
      });
    }
  });

  // ── S9 and S8 terminal states ───────────────────────────────────────────────

  describe('terminal states', () => {
    describe('every blocking gate passing', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(
        TestLive(
          liveInput({
            terminalUI: recorded.ui,
            connectedAccountsData: { items: [account({ id: 'con_github', status: 'ACTIVE' })] },
            cliUserConfig: {
              onboarding: {
                hasExecuted: true,
                lastExecution: { slug: 'GITHUB_GET_THE_AUTHENTICATED_USER', at: '2026-07-01Z' },
              },
            },
          })
        )
      )(it => {
        it.scoped('prints status, calls no delegate, and exits zero', () =>
          Effect.gen(function* () {
            recorded.reset();
            yield* Console.clear;
            const loginSpy = vi.spyOn(loginCmd, 'browserLogin');
            const linkSpy = vi.spyOn(linkCmd, 'runConnectedAccountsLink');
            const executeSpy = vi.spyOn(executeCmd, 'runToolsExecute');

            yield* cli(['onboard', '--toolkit', 'github']);

            const document = soleDocument(recorded.stdout);
            expect(document.onboarded).toBe(true);
            expect(document.next_gate).toBeNull();
            expect(document.next_command).toBeNull();
            expect(loginSpy).not.toHaveBeenCalled();
            expect(linkSpy).not.toHaveBeenCalled();
            expect(executeSpy).not.toHaveBeenCalled();
            expect((yield* MockConsole.getLines({ stripAnsi: true })).join('\n')).toContain(
              "You're all set."
            );
          })
        );
      });
    });

    describe('a connected toolkit with no curated demo', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(
        TestLive(
          liveInput({
            terminalUI: recorded.ui,
            connectedAccountsData: {
              items: [
                account({ id: 'con_hubspot', status: 'ACTIVE', toolkit: { slug: 'hubspot' } }),
              ],
            },
          })
        )
      )(it => {
        it.scoped('defers with search prose rather than a command', () =>
          Effect.gen(function* () {
            recorded.reset();

            yield* cli(['onboard', '--toolkit', 'hubspot']);

            const document = soleDocument(recorded.stdout);
            expect(document.gates.execute.status).toBe('deferred');
            expect(document.next_gate).toBeNull();
            expect(document.onboarded).toBe(false);
            expect(document.next_command).toBeNull();
            expect(document.human_action).toContain('composio search');
          })
        );
      });
    });

    describe('--skip connect', () => {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(TestLive(liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: [] } })))(
        it => {
          it.scoped('marks the gate skipped and moves on to execute', () =>
            Effect.gen(function* () {
              recorded.reset();

              yield* cli(['onboard', '--skip', 'connect', '--toolkit', 'github', '--status']);

              const document = soleDocument(recorded.stdout);
              expect(document.gates.connect.status).toBe('skipped');
              expect(document.next_gate).toBe('execute');
              expect(document.onboarded).toBe(false);
            })
          );
        }
      );
    });
  });

  // ── R12/R13: one document, always discriminated ─────────────────────────────

  describe('the document contract', () => {
    const MODES = [
      { name: 'logged out', items: [] as ReadonlyArray<ConnectedAccountItem>, argv: ['onboard'] },
      {
        name: 'connected',
        items: [account({ id: 'con_github', status: 'ACTIVE' })],
        argv: ['onboard', '--status', '--toolkit', 'github'],
      },
      {
        name: 'authorization outstanding',
        items: [account({ id: 'con_github_pending', status: 'INITIATED' })],
        argv: ['onboard', '--toolkit', 'github'],
      },
      {
        name: 'no toolkit named',
        items: [account({ id: 'con_github', status: 'ACTIVE' })],
        argv: ['onboard'],
      },
    ] as const;

    for (const mode of MODES) {
      const recorded = recordingUI({ tty: { stdin: false, stdout: false, stderr: true } });

      layer(
        TestLive(
          liveInput({ terminalUI: recorded.ui, connectedAccountsData: { items: [...mode.items] } })
        )
      )(it => {
        it.scoped(`[${mode.name}] emits exactly one discriminated document`, () =>
          Effect.gen(function* () {
            recorded.reset();
            vi.spyOn(linkCmd, 'runConnectedAccountsLink').mockReturnValue(
              Effect.succeed({ kind: 'not_started', reason: 'request_failed' as const })
            );

            yield* cli([...mode.argv]);

            const document = soleDocument(recorded.stdout);
            expect(document.kind).toBe('onboard_state');
            expect(document.v).toBe(2);
            // No emitted command is ever a template.
            expect(document.next_command ?? '').not.toContain('<');
            expect(document.human_action ?? '').not.toContain('<');
          })
        );
      });
    }
  });

  // ── The test double's own contract ──────────────────────────────────────────

  describe('the TerminalUI double honours the stream contracts it is used to test', () => {
    layer(TestLive({ commandRunner: noHostsRunner }))(it => {
      it.effect('withholds output on a terminal stdout and honours force', () =>
        Effect.gen(function* () {
          // A double that hardcoded `stdout.isTTY: false` and ignored `force` could not express
          // either half, which is why the four-mode matrix above was previously untestable.
          const onTty = recordingUI({ tty: { stdin: true, stdout: true, stderr: true } });
          yield* onTty.ui.output('withheld');
          expect(onTty.stdout).toEqual([]);
          yield* onTty.ui.output('forced', { force: true });
          expect(onTty.stdout).toEqual(['forced']);

          const piped = recordingUI({ tty: { stdin: true, stdout: false, stderr: true } });
          yield* piped.ui.output('emitted');
          expect(piped.stdout).toEqual(['emitted']);
        })
      );
    });
  });

  // ── The serializer ──────────────────────────────────────────────────────────

  describe('serializeOnboardState', () => {
    layer(TestLive({ commandRunner: noHostsRunner }))(it => {
      it.effect('puts kind and v first so a reader can switch before parsing the rest', () =>
        Effect.sync(() => {
          const serialized = serializeOnboardState(
            {
              onboarded: false,
              nextGate: 'login',
              task: null,
              toolkit: null,
              gates: {
                hostWiring: { status: 'not_applicable', blocking: false, hosts: [] },
                login: { status: 'unsatisfied', email: null, orgId: null },
                connect: {
                  status: 'unsatisfied',
                  toolkit: null,
                  connectedToolkits: [],
                  connectedAccountId: null,
                  redirectUrl: null,
                },
                execute: { status: 'unsatisfied', toolSlug: null, lastExecutedAt: null },
              },
              advisories: [],
            },
            { kind: 'done' }
          );

          expect(
            Object.keys(JSON.parse(serialized) as Record<string, unknown>).slice(0, 2)
          ).toEqual(['kind', 'v']);
        })
      );
    });
  });
});
