import { CommandInputError } from 'src/commands/errors';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, layer } from '@effect/vitest';
import { assertDefined } from '@effect/vitest/utils';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as Path from 'effect/Path';
import * as FileSystem from 'effect/FileSystem';
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Runtime } from 'effect';
import { afterEach, it, vi } from 'vitest';
import { inferCliInvocationPrefix } from 'src/commands/run/run.handler';
import {
  extractInlineExecuteToolSlugs,
  prepareRunProgram,
} from 'src/commands/run-source-transforms';
import {
  readInstalledReleaseTag,
  writeInstalledReleaseTag,
} from 'src/services/run-companion-modules';
import { NodeOs } from 'src/services/node-os';
import { telemetryDebugModeLayer } from 'src/services/runtime-flags';
import type { RunScriptWithHelpersParams } from 'src/services/run-helpers-runtime';
import { cli, MockConsole, recordedInvocationCalls, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { ChildProcessExited } from 'src/effects/child-process-exited';

/**
 * The confined runtime the handler loads from the executable. Each test sees
 * what the handler hands it, and decides how the script ends; the runtime itself is covered by
 * `run-script-engine.test.ts` and, end to end, by `run.contract.cmd.test.ts`.
 */
const scriptRuns = vi.hoisted(() =>
  vi.fn((_params: RunScriptWithHelpersParams): Promise<{ readonly exitCode: number }> =>
    Promise.resolve({ exitCode: 0 })
  )
);

vi.mock('src/services/run-helpers-runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('src/services/run-helpers-runtime')>()),
  runScriptWithHelpers: scriptRuns,
}));

const enabledRuntimeFlagsConfigProvider = ConfigProvider.fromEnvRecord({
  COMPOSIO_RUN_ACP_ONLY: '1',
  COMPOSIO_PERF_DEBUG: '1',
  COMPOSIO_TOOL_DEBUG: '1',
});

/** What the handler handed the runtime for its only (or last) script. */
const lastRun = (): RunScriptWithHelpersParams => {
  const params = scriptRuns.mock.calls.at(-1)?.[0];
  assertDefined(params);
  return params;
};

/** The helper context and CLI prefix the script's helpers were built with, as JSON. */
const helperSource = (params: RunScriptWithHelpersParams = lastRun()): string =>
  JSON.stringify({ cliPrefix: params.cliPrefix, helperContext: params.helperContext });

/** The script's own arguments: `process.argv` without the runtime (and the file, for --file). */
const scriptArgs = (params: RunScriptWithHelpersParams = lastRun()) =>
  params.argv.slice(params.displayName === '[eval]' ? 1 : 2);

/** A script file in a temporary directory that is removed when the test's scope closes. */
const tempScript = Effect.acquireRelease(
  Effect.sync(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-test-'));
    const scriptPath = path.join(tempDir, 'script.ts');
    fs.writeFileSync(scriptPath, 'const value = 1 + 1;\nvalue * 2;\n', 'utf8');
    return { tempDir, scriptPath };
  }),
  ({ tempDir }) => Effect.sync(() => fs.rmSync(tempDir, { recursive: true, force: true }))
);

const SCRIPT = 'console.log("hi")';
const SCRIPT_FLAGS = ['--perf-debug', '--tool-debug', '--telemetry-debug', '--help', '--version'];

const RunTestLive = (input: Parameters<typeof TestLive>[0] = {}) => TestLive(input);

/** The run log the run advertised on stderr; removed, since it outlives the run by design. */
const takeRunLog = (lines: ReadonlyArray<string>) => {
  const runLogPath = String(lines.find(line => line.startsWith('RUN_LOG_FILE='))).slice(
    'RUN_LOG_FILE='.length
  );
  const exists = fs.existsSync(runLogPath);
  fs.rmSync(path.dirname(runLogPath), { recursive: true, force: true });
  return { runLogPath, exists };
};

describe('CLI: composio run', () => {
  afterEach(() => {
    scriptRuns.mockReset().mockImplementation(() => Promise.resolve({ exitCode: 0 }));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  layer(RunTestLive())(it => {
    it.effect('[Given] a root run [Then] the script sees the run id its telemetry recorded', () =>
      Effect.gen(function* () {
        yield* cli(['--telemetry-debug', 'run', 'console.log("hi")']);

        expect(scriptRuns).toHaveBeenCalledTimes(1);
        const invoked = (yield* recordedInvocationCalls).find(
          call => call.service === 'CommandLifecycleTelemetry' && call.event === 'invoked'
        );
        const runId =
          invoked?.service === 'CommandLifecycleTelemetry' && invoked.event === 'invoked'
            ? invoked.context.runId
            : undefined;
        assertDefined(runId);
        expect(lastRun().envOverrides.COMPOSIO_CLI_PARENT_RUN_ID).toBe(runId);
        expect(lastRun().helperContext?.runId).toBe(runId);
      })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] inline code and args [Then] it runs the code in this process with the args as process.argv',
      () =>
        Effect.gen(function* () {
          scriptRuns.mockImplementation(() => Promise.resolve({ exitCode: 7 }));

          const exit = yield* Effect.exit(cli(['run', 'console.log("hi")', '--flag', 'value']));
          const output = yield* MockConsole.getLines();

          // The process exits with the script's code.
          expect(exitCodeOf(exit)).toBe(7);
          expect(scriptRuns).toHaveBeenCalledTimes(1);
          const params = lastRun();
          expect(params.program.body).toBe('return (console.log("hi"));');
          expect(params.source).toBe('console.log("hi")');
          expect(params.displayName).toBe('[eval]');
          expect(params.argv).toEqual([process.execPath, '--flag', 'value']);
          expect(params.signal).toBeInstanceOf(AbortSignal);
          expect(output).toContainEqual(expect.stringMatching(/^RUN_LOG_FILE=.*run\.log$/));
          // The run log is advertised to the caller on stderr, so it has to outlive the run.
          const runLog = takeRunLog(output);
          expect(runLog.exists).toBe(true);
          expect(params.helperContext?.runLogFilePath).toBe(runLog.runLogPath);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a script that exits non-zero [Then] it fails with ChildProcessExited, which the runtime does not log',
      () =>
        Effect.gen(function* () {
          scriptRuns.mockImplementation(() => Promise.resolve({ exitCode: 3 }));

          const failure = yield* cli(['run', 'console.log("hi")']).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(ChildProcessExited);
          expect(failure).toMatchObject({ code: 3 });
          // The script already reported its own failure; the runner must not add a log.
          expect(Runtime.getErrorReported(failure)).toBe(false);
        })
    );

    it.effect('[Given] a script that exits 0 [Then] the run succeeds', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['run', 'console.log("hi")']));

        expect(exitCodeOf(exit)).toBe(0);
      })
    );

    // Ctrl-C interrupts the run while the script is still running: the process exits 130, not 0,
    // so wrappers and `set -e` scripts do not read a cancelled run as a passing one, and the
    // script is told to stop.
    it.effect(
      '[Given] the run is interrupted [Then] the script is aborted and the process exits 130',
      () =>
        Effect.gen(function* () {
          const started = yield* Deferred.make<AbortSignal>();
          scriptRuns.mockImplementation(
            params =>
              new Promise(() => {
                Deferred.doneUnsafe(started, Effect.succeed(params.signal!));
              })
          );

          const fiber = yield* Effect.forkChild(cli(['run', 'console.log("hi")']));
          const signal = yield* Deferred.await(started);
          expect(signal.aborted).toBe(false);
          yield* Fiber.interrupt(fiber);

          expect(signal.aborted).toBe(true);
          expect(exitCodeOf(yield* Fiber.await(fiber))).toBe(130);
        })
    );

    it.effect('[Given] the runtime rejects [Then] the run fails as a defect', () =>
      Effect.gen(function* () {
        scriptRuns.mockImplementation(() => Promise.reject(new Error('engine bug')));

        const exit = yield* Effect.exit(cli(['run', 'console.log("hi")']));

        expect(exitCodeOf(exit)).toBe(1);
      })
    );
  });

  layer(RunTestLive())(it => {
    it.effect('[Given] a run [Then] the helper context carries no sub-agent inputs', () =>
      Effect.gen(function* () {
        yield* cli(['run', 'console.log("hi")']);

        const source = helperSource();
        expect(source).toContain('"runLogFilePath":');
        expect(source).not.toContain('"master":');
        expect(source).not.toContain('"readAccessRoots":');
        expect(source).not.toContain('"cliConfigPath":');
      })
    );

    it.effect(
      '[Given] a run from source [Then] the helpers spawn the CLI with the same runtime and entrypoint',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', 'console.log("hi")']);

          expect(lastRun().cliPrefix[0]).toBe(process.execPath);
        })
    );
  });

  layer(RunTestLive({ baseConfigProvider: enabledRuntimeFlagsConfigProvider }))(it => {
    it.effect(
      '[Given] COMPOSIO_RUN_ACP_ONLY=1 [Then] only the remaining debug flags reach the script',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', 'console.log("hi")']);

          expect(lastRun().envOverrides).toEqual({
            COMPOSIO_CLI_PARENT_RUN_ID: expect.any(String),
            COMPOSIO_PERF_DEBUG: '1',
            COMPOSIO_TOOL_DEBUG: '1',
            COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
          });
          const source = helperSource();
          expect(source).toContain('"perfDebug":true');
          expect(source).toContain('"toolDebug":true');
          expect(source).toContain('"telemetryDebug":false');
          expect(source).not.toContain('acpOnly');
          expect(source).not.toContain('COMPOSIO_RUN_ACP_ONLY');
        })
    );

    it.effect('[Given] explicit false flags [Then] inherited true values are cleared', () =>
      Effect.gen(function* () {
        yield* cli(['run', '--perf-debug=false', '--tool-debug=false', 'console.log("hi")']);

        expect(lastRun().envOverrides).toMatchObject({
          COMPOSIO_PERF_DEBUG: '0',
          COMPOSIO_TOOL_DEBUG: '0',
          COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
        });
        const source = helperSource();
        expect(source).toContain('"perfDebug":false');
        expect(source).toContain('"toolDebug":false');
      })
    );
  });

  const webURLForwarding = [
    {
      name: 'no URL overrides',
      env: {},
      forwarded: true,
    },
    {
      name: 'a custom backend URL with no web URL',
      env: { COMPOSIO_BASE_URL: 'https://composio.internal.example' },
      forwarded: false,
    },
    {
      name: 'a custom backend URL and a web URL',
      env: {
        COMPOSIO_BASE_URL: 'https://composio.internal.example',
        COMPOSIO_WEB_URL: 'https://dashboard.internal.example',
      },
      forwarded: true,
    },
  ] as const;

  describe.each(webURLForwarding)('$name', testCase => {
    layer(
      RunTestLive({
        baseConfigProvider: ConfigProvider.fromEnv({ env: testCase.env }),
      })
    )(it => {
      // A forwarded web URL is what moves a script's `execute()` onto the
      // Dashboard, so it must not appear when this process stays on the backend.
      it.effect(
        `[Given] ${testCase.name} [Then] the web URL is ${testCase.forwarded ? '' : 'not '}forwarded to helpers`,
        () =>
          Effect.gen(function* () {
            yield* cli(['run', 'console.log("hi")']);

            const source = helperSource();
            expect(source).toContain('"baseURL":');
            expect(source.includes('"webURL":')).toBe(testCase.forwarded);
          })
      );
    });
  });

  // A made-up host session ID and the agent session ID it derives to for host `claude`.
  const CLAUDE_SESSION = '00000000-0000-4000-8000-000000000001';
  const CLAUDE_AGENT_SESSION_ID = 'df095fd9-410b-5ec9-b678-4ed04b5ab2dd';

  const FORWARDED_AGENT_SESSION = `"agentSessionHeaders":${JSON.stringify({
    'x-cli-agent-session-host': 'claude',
    'x-cli-agent-session-id': CLAUDE_AGENT_SESSION_ID,
  })}`;

  // The telemetry switches and agent session variables the live environment could supply,
  // each set here so the shell or agent host that runs the suite cannot. Blank reads as unset.
  const stubAgentSessionEnvironment = (overrides: Record<string, string>) =>
    Object.entries({
      NODE_ENV: 'development',
      CI: 'false',
      TELEMETRY_DISABLED: '',
      CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION,
      CODEX_SESSION_ID: '',
      CODEX_THREAD_ID: '',
      ...overrides,
    }).forEach(([name, value]) => vi.stubEnv(name, value));

  const agentSessionForwarding: ReadonlyArray<{
    readonly name: string;
    readonly env: Record<string, string>;
    readonly forwarded: boolean;
  }> = [
    { name: 'a Claude Code chat with telemetry on', env: {}, forwarded: true },
    ...[
      ['COMPOSIO_CLI_TELEMETRY_DISABLED', 'true'],
      ['COMPOSIO_DISABLE_TELEMETRY', 'true'],
      ['TELEMETRY_DISABLED', 'true'],
      ['CI', 'true'],
      ['NODE_ENV', 'test'],
    ].map(([name, value]) => ({
      name: `a Claude Code chat with ${name}=${value}`,
      env: { [name]: value },
      forwarded: false,
    })),
    { name: 'no agent host', env: { CLAUDE_CODE_SESSION_ID: '' }, forwarded: false },
  ];

  describe.each(agentSessionForwarding)('$name', testCase => {
    // `TestLive` hides every `COMPOSIO_*` variable of the live environment, so a case's values
    // also go in the base provider, whose values win. A blank there falls through to the live
    // environment, which is why the test stubs it as well.
    layer(RunTestLive({ baseConfigProvider: ConfigProvider.fromEnvRecord(testCase.env) }))(it => {
      it.effect(
        `[Given] ${testCase.name} [Then] helpers get the agent session headers: ${testCase.forwarded}`,
        () =>
          Effect.gen(function* () {
            stubAgentSessionEnvironment(testCase.env);
            yield* cli(['run', 'console.log("hi")']);
            const preloadSource = helperSource();

            expect(preloadSource).toContain('"baseURL":');
            expect(preloadSource.includes(FORWARDED_AGENT_SESSION)).toBe(testCase.forwarded);
            expect(preloadSource.includes('agentSessionHeaders')).toBe(testCase.forwarded);
            // The host's own session ID stays in the parent process.
            expect(preloadSource).not.toContain(CLAUDE_SESSION);
          })
      );
    });
  });

  layer(RunTestLive())(it => {
    it.effect(
      "[Given] a compaction file for the chat [Then] helpers get the chat's compaction count",
      () =>
        Effect.gen(function* () {
          stubAgentSessionEnvironment({});
          const hostDir = path.join(
            (yield* NodeOs).homedir,
            '.composio',
            'agent-compactions',
            'claude'
          );
          fs.mkdirSync(hostDir, { recursive: true });
          fs.writeFileSync(path.join(hostDir, CLAUDE_SESSION), 'auto\nmanual\n');
          yield* cli(['run', 'console.log("hi")']);
          const preloadSource = helperSource();

          expect(preloadSource).toContain('"x-cli-agent-compaction-count":"2"');
          expect(preloadSource).not.toContain(CLAUDE_SESSION);
        })
    );
  });

  layer(Layer.merge(RunTestLive(), telemetryDebugModeLayer(true)))(it => {
    it.effect(
      '[Given] --telemetry-debug [Then] the script and its helper children observe it',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', 'console.log("hi")']);

          expect(lastRun().envOverrides.COMPOSIO_CLI_TELEMETRY_DEBUG).toBe('1');
          expect(helperSource()).toContain('"telemetryDebug":true');
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect.each([
      { flag: '--acp-only', name: '--acp-only' },
      { flag: '--acp-only=false', name: '--acp-only' },
      { flag: '--no-acp-only', name: '--no-acp-only' },
      { flag: '--logs-off', name: '--logs-off' },
      { flag: '--logs-off=false', name: '--logs-off' },
      { flag: '--no-logs-off', name: '--no-logs-off' },
      { flag: '--foo_bar', name: '--foo_bar' },
      { flag: '--foo_bar=value', name: '--foo_bar' },
    ])('[Given] the unknown $flag [Then] run rejects it as an unknown flag', ({ flag, name }) =>
      Effect.gen(function* () {
        const failure = yield* cli(['run', flag, 'console.log(1)']).pipe(Effect.flip);

        expect(failure).toMatchObject({ _tag: 'ShowHelp' });
        expect(scriptRuns).not.toHaveBeenCalled();
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain(`Unrecognized flag: ${name} in command composio run`);
      })
    );

    it.effect('[Given] repeated invocations [Then] hidden flags do not leak', () =>
      Effect.gen(function* () {
        yield* cli(['run', '--perf-debug', 'console.log("first")']);
        yield* cli(['run', 'console.log("second")']);

        expect(scriptRuns).toHaveBeenCalledTimes(2);
        expect(helperSource(scriptRuns.mock.calls[0]![0])).toContain('"perfDebug":true');
        expect(helperSource(scriptRuns.mock.calls[1]![0])).toContain('"perfDebug":false');
      })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a multiline execute script [Then] run preserves the inline TypeScript source',
      () =>
        Effect.gen(function* () {
          const script = `
            const issue = await execute(
              "GITHUB_CREATE_ISSUE",
              {
                owner: "acme",
                title: [
                  "Deploy v2",
                  "Do not run terminal commands.",
                ].join("\\n"),
              }
            );
            console.log(JSON.stringify(issue));
            console.log(JSON.stringify(issue.data));
          `;
          yield* cli(['run', script]);

          expect(scriptRuns).toHaveBeenCalledTimes(1);
          const { body } = lastRun().program;
          expect(body).toContain('const issue = await execute(');
          expect(body).toContain('"Do not run terminal commands."');
          expect(body).toContain('].join("\\n"),');
          expect(body).toContain('owner: "acme"');
          expect(body).toContain('console.log(JSON.stringify(issue));');
          expect(body).toContain('return (console.log(JSON.stringify(issue.data)));');
          expect(body).not.toContain('"Do not run terminal\n');
          // Lines are kept, so an error points at the line the user wrote.
          expect(body.split('\n')).toHaveLength(script.split('\n').length);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect('[Given] --file [Then] it runs the file with its path and args as process.argv', () =>
      Effect.gen(function* () {
        const { scriptPath, tempDir } = yield* tempScript;
        yield* cli(['run', '--file', scriptPath, '--', 'hello']);

        expect(scriptRuns).toHaveBeenCalledTimes(1);
        const params = lastRun();
        expect(params.argv).toEqual([process.execPath, scriptPath, 'hello']);
        expect(params.displayName).toBe(scriptPath);
        expect(params.source).toBe('const value = 1 + 1;\nvalue * 2;\n');
        expect(params.program.body).toContain('return (value * 2);');
        // Nothing is written next to the user's script.
        expect(fs.readdirSync(tempDir)).toEqual(['script.ts']);
      })
    );

    it.effect(
      '[Given] --file names a missing file [Then] it fails with a usage error naming it',
      () =>
        Effect.gen(function* () {
          const missing = path.join(os.tmpdir(), 'composio-run-missing-script.ts');

          const failure = yield* cli(['run', '--file', missing]).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(CommandInputError);
          expect(failure).toMatchObject({
            message: expect.stringContaining(`Cannot read the script file ${missing}`),
          });
          expect(scriptRuns).not.toHaveBeenCalled();
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] no inline code and no --file [Then] it fails with a typed usage error, not a defect',
      () =>
        Effect.gen(function* () {
          const failure = yield* cli(['run']).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(CommandInputError);
          expect(failure).toMatchObject({
            message: expect.stringContaining(
              'Provide inline code or use --file to run a script file.'
            ),
          });
          // Nothing was set up before the check, so no script was started.
          expect(scriptRuns).not.toHaveBeenCalled();
          expect(yield* MockConsole.getLines()).not.toContainEqual(
            expect.stringMatching(/^RUN_LOG_FILE=/)
          );
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] --file=path inline form followed by --dry-run [Then] both parse as run flags',
      () =>
        Effect.gen(function* () {
          const { scriptPath } = yield* tempScript;
          yield* cli(['run', `--file=${scriptPath}`, '--dry-run']);

          expect(scriptRuns).toHaveBeenCalledTimes(1);
          // `--file=...` must be recognized as a run flag, and `--dry-run` must not leak into
          // the script's arguments.
          expect(lastRun().displayName).toBe(scriptPath);
          expect(lastRun().argv).not.toContain('--dry-run');
          expect(lastRun().helperContext?.dryRun).toBe(true);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect.each([
      { layout: 'no delimiter', args: [SCRIPT, ...SCRIPT_FLAGS] },
      { layout: 'a delimiter after the code', args: [SCRIPT, '--', ...SCRIPT_FLAGS] },
      { layout: 'a delimiter before the code', args: ['--', SCRIPT, ...SCRIPT_FLAGS] },
    ])('forwards script flags with $layout without enabling them in the CLI', ({ args }) =>
      Effect.gen(function* () {
        yield* cli(['--perf-debug=false', 'run', ...args]);

        expect(scriptRuns).toHaveBeenCalledTimes(1);
        expect(scriptArgs()).toEqual(SCRIPT_FLAGS);
        expect(lastRun().envOverrides).toMatchObject({
          COMPOSIO_PERF_DEBUG: '0',
          COMPOSIO_TOOL_DEBUG: '0',
          COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
        });
      })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a second literal -- in passthrough args [Then] it is forwarded to the script',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', 'console.log("hi")', '--', 'alpha', '--', 'beta']);

          // The first `--` is the run/script boundary; the second is a script argument and
          // must reach the script verbatim.
          expect(scriptArgs()).toEqual(['alpha', '--', 'beta']);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a script arg literally starting with the old escape-marker string [Then] it reaches the script untouched',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', 'console.log("hi")', '@@composio-run-raw@@literal']);

          expect(scriptArgs()).toEqual(['@@composio-run-raw@@literal']);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] run help [Then] it documents injected execute, search, proxy, and z helpers without the removed sub-agent',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', '--help']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain(
            'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.'
          );
          expect(output).toContain('--skip-connection-check');
          expect(output).toContain('--skip-tool-params-check');
          expect(output).toContain('--skip-checks');
          expect(output).not.toContain('--logs-off');
          expect(output).not.toContain('experimental_subAgent');
          expect(output).toContain('Injected helpers');
          expect(output).toContain('execute(slug, data?)');
          expect(output).toContain('search(query, options?)');
          expect(output).toContain('result.prompt()');
          expect(output).toContain('const f = await proxy(toolkit)');
          expect(output).toContain('Injected global from `zod`');
          expect(output).toContain('composio search "<query>"');
          expect(output).toContain('composio execute <slug> --get-schema');
          expect(output).not.toContain('--acp-only');
        })
    );
  });
});

describe('inferCliInvocationPrefix', () => {
  layer(BunServices.layer)(it => {
    it.effect.each([
      '/$bunfs/root/composio',
      'B:\\$bunfs\\root\\composio.exe',
      'B:/~BUN/root/composio.exe',
      'B:\\~BUN\\root\\composio.exe',
    ])(
      '[Given] a compiled entrypoint %s [Then] it falls back to the binary path only',
      entrypoint =>
        Effect.gen(function* () {
          const pathService = yield* Path.Path;
          expect(
            yield* inferCliInvocationPrefix(pathService, ['node', entrypoint]).pipe(
              Effect.provide(FileSystem.layerNoop({ exists: () => Effect.succeed(true) }))
            )
          ).toEqual([process.execPath]);
        })
    );
  });
});

describe('run companion install metadata', () => {
  layer(BunServices.layer)(it => {
    it.effect(
      '[Given] an installed release tag file [Then] run helpers can read it back from the install dir',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-release-tag-'));
          const execPath = path.join(tempDir, 'composio');

          yield* writeInstalledReleaseTag(tempDir, '@composio/cli@0.2.12');

          expect(yield* readInstalledReleaseTag(execPath)).toBe('@composio/cli@0.2.12');
        })
    );
  });
});

describe('extractInlineExecuteToolSlugs', () => {
  it('[Given] inline run source [Then] it finds static execute slugs from the AST', () => {
    expect(
      extractInlineExecuteToolSlugs(`
        const first = await execute("GMAIL_SEND_EMAIL", { to: "a@b.com" });
        const dynamic = await execute(slug, payload);
        execute('GITHUB_CREATE_ISSUE', { owner: 'acme' });
        execute("GMAIL_SEND_EMAIL", { to: "b@c.com" });
      `)
    ).toEqual(['GMAIL_SEND_EMAIL', 'GITHUB_CREATE_ISSUE']);
  });
});

describe('extractInlineExecuteToolSlugs', () => {
  it('[Given] inline run source [Then] it finds static execute slugs from the AST', () => {
    expect(
      extractInlineExecuteToolSlugs(`
        const first = await execute("GMAIL_SEND_EMAIL", { to: "a@b.com" });
        const dynamic = await execute(slug, payload);
        execute('GITHUB_CREATE_ISSUE', { owner: 'acme' });
        execute("GMAIL_SEND_EMAIL", { to: "b@c.com" });
      `)
    ).toEqual(['GMAIL_SEND_EMAIL', 'GITHUB_CREATE_ISSUE']);
  });
});

describe('prepareRunProgram', () => {
  it('[Given] JavaScript ending in an expression [Then] it returns it and keeps the source otherwise', () => {
    expect(prepareRunProgram('const value = 1 + 1;\nvalue * 2;\n')).toEqual({
      imports: '',
      body: 'const value = 1 + 1;\nreturn (value * 2);\n',
      columnShifts: [{ line: 2, column: 0, delta: 'return ('.length }],
    });
  });

  it('[Given] a script ending in a declaration [Then] nothing is returned', () => {
    expect(prepareRunProgram('const value = 1;').body).toBe('const value = 1;');
  });

  it('[Given] TypeScript [Then] it compiles it and maps it back with a source map', () => {
    const prepared = prepareRunProgram(
      'interface User {\n  login: string;\n}\nconst user: User = { login: "octocat" };\nuser.login'
    );
    expect(prepared.body).not.toContain('interface');
    expect(prepared.body).not.toContain(': User');
    expect(prepared.body).toContain('return (user.login);');
    expect(prepared.sourceMap).toBeDefined();
  });

  it('[Given] a call with type arguments [Then] it stays a call', () => {
    expect(prepareRunProgram('await Promise.resolve<number>(42)').body).toBe(
      'return (await Promise.resolve(42));'
    );
  });

  it('[Given] a .js file [Then] it is read as JavaScript', () => {
    expect(prepareRunProgram('a < b > (c)', 'script.js').body).toBe('return (a < b > (c));');
  });

  it('[Given] type-only imports [Then] they disappear with the types', () => {
    const prepared = prepareRunProgram(
      'import type { User } from "./types";\nconst user: User = {};\nuser'
    );
    expect(prepared.imports).toBe('');
    expect(prepared.body).not.toContain('./types');
  });

  it('[Given] imports of zod and process [Then] they bind to the runtime globals on the same lines', () => {
    const prepared = prepareRunProgram(
      [
        'import { z } from "zod";',
        'import { z as schema } from "zod/v4";',
        'import * as zodNamespace from "zod";',
        'import { argv, env as environment } from "node:process";',
        'import process from "process";',
        'console.log(z, schema, zodNamespace, argv, environment, process);',
      ].join('\n')
    );
    expect(prepared.imports).toBe('');
    expect(prepared.body.split('\n')).toEqual([
      '',
      'const schema = z;',
      'const zodNamespace = z;',
      'const argv = process.argv; const environment = process.env;',
      '',
      'return (console.log(z, schema, zodNamespace, argv, environment, process));',
    ]);
  });

  it('[Given] imports of other modules [Then] they are hoisted for the runtime to resolve, keeping lines', () => {
    const prepared = prepareRunProgram(
      'import fs from "node:fs";\nimport {\n  join\n} from "node:path";\nfs.readFileSync(join("a"));'
    );
    expect(prepared.imports).toBe('import fs from "node:fs"; import { join } from "node:path";');
    expect(prepared.body.split('\n')).toHaveLength(5);
  });

  it('[Given] exports [Then] the export keyword is dropped and the shift recorded', () => {
    const prepared = prepareRunProgram(
      'export const a = 1;\nexport { a as b };\nexport function f() {}'
    );
    expect(prepared.body).toBe('const a = 1;\n\nfunction f() {}');
    expect(prepared.columnShifts).toContainEqual({ line: 1, column: 0, delta: -'export '.length });
  });

  it('[Given] a re-export from a module [Then] the module is kept as an import, unless it is virtual', () => {
    const prepared = prepareRunProgram('export * from "./setup.js";\nexport { z } from "zod";\n1');
    expect(prepared.imports).toBe('import "./setup.js";');
    expect(prepared.body).toBe('\n\nreturn (1);');
  });

  it('[Given] a hashbang [Then] it becomes a comment', () => {
    expect(prepareRunProgram('#!/usr/bin/env bun\nconsole.log(1)').body).toBe(
      '///usr/bin/env bun\nreturn (console.log(1));'
    );
  });
});
