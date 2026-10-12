import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, layer } from '@effect/vitest';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as Path from 'effect/Path';
import { Cause, ConfigProvider, Effect, Exit, Layer, Option, Sink, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { afterEach, it, vi } from 'vitest';
import { createCliCommandTelemetryContext } from 'src/analytics/events';
import {
  buildRunHelpersSource,
  inferCliInvocationPrefix,
  MissingRunSourceError,
} from 'src/commands/run.cmd';
import {
  extractInlineExecuteToolSlugs,
  wrapInlineCodeForRun,
} from 'src/commands/run-source-transforms';
import {
  RUN_COMPANION_MODULE_FILENAMES,
  listMissingInstalledRunCompanionModules,
  readInstalledReleaseTag,
  resolveRunCompanionModulePath,
  writeInstalledReleaseTag,
} from 'src/services/run-companion-modules';
import { extendConfigProvider } from 'src/services/config';
import { telemetryDebugModeLayer } from 'src/services/runtime-flags';
import { DEFAULT_CLI_INVOCATION_ORIGIN } from 'src/services/runtime-cli-context';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { CommandRunner } from 'src/services/command-runner';

const enabledRuntimeFlagsConfigProvider = ConfigProvider.fromEnvRecord({
  COMPOSIO_RUN_ACP_ONLY: '1',
  COMPOSIO_PERF_DEBUG: '1',
  COMPOSIO_TOOL_DEBUG: '1',
}).pipe(extendConfigProvider);

const readRunPreloadSource = (command: ReadonlyArray<string>): string => {
  const preloadPath = command[2];
  if (preloadPath === undefined) {
    throw new Error('Expected the run command to include a preload file.');
  }
  return fs.readFileSync(preloadPath, 'utf8');
};

const commandRuns = vi.fn((_: ChildProcess.Command) =>
  Effect.succeed(ChildProcessSpawner.ExitCode(0))
);

// `composio run` starts the child through the platform `ChildProcessSpawner` so it owns the
// pid it forwards signals to, so the stub has to replace the spawner rather than
// `CommandRunner`. `exitCode` stays suspended: the command only awaits it after the signal
// handlers are registered, which is what makes the forwarding observable below.
const STUB_CHILD_PID = 987_654;

const stubHandle = (command: ChildProcess.Command): ChildProcessSpawner.ChildProcessHandle =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(STUB_CHILD_PID),
    exitCode: Effect.suspend(() => commandRuns(command)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });

const StubChildProcessSpawner = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(command => Effect.succeed(stubHandle(command)))
);

const RunTestLive = (input: Parameters<typeof TestLive>[0] = {}) =>
  Layer.merge(
    TestLive({
      ...input,
      commandRunner: CommandRunner.of({
        run: command => commandRuns(command),
        capture: () => Effect.succeed({ exitCode: 0, stdout: '', stderr: '' }),
      }),
    }),
    StubChildProcessSpawner
  );

const inspectRunCommand = (command: ChildProcess.Command) => {
  if (!ChildProcess.isStandardCommand(command)) {
    throw new Error('Expected the run command to be a standard (non-piped) command.');
  }
  return {
    cmd: [command.command, ...command.args],
    env: command.options.env ?? {},
    extendEnv: command.options.extendEnv,
    stdio: [command.options.stdin, command.options.stdout, command.options.stderr],
  };
};

describe('CLI: composio run', () => {
  afterEach(() => {
    process.exitCode = undefined;
    commandRuns
      .mockReset()
      .mockImplementation(() => Effect.succeed(ChildProcessSpawner.ExitCode(0)));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  layer(RunTestLive())(it => {
    it.effect('[Given] a root run telemetry id [Then] the child receives the same run id', () =>
      Effect.gen(function* () {
        const telemetryContext = createCliCommandTelemetryContext(
          ['bun', 'composio', '--telemetry-debug', 'run', 'console.log("hi")'],
          '0.0.0-test',
          { stdoutIsTTY: false, stderrIsTTY: false },
          { invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN, parentRunId: undefined }
        );
        const runId = telemetryContext.runId;
        expect(runId).toBeDefined();
        if (runId === undefined) return;

        commandRuns.mockImplementation(command => {
          expect(inspectRunCommand(command).env.COMPOSIO_CLI_PARENT_RUN_ID).toBe(runId);
          return Effect.succeed(ChildProcessSpawner.ExitCode(0));
        });

        // The bootstrap hands the run id it minted for telemetry to the command, the way
        // `cli-main.ts` does, instead of publishing it through process-wide state.
        yield* cli(['--telemetry-debug', 'run', 'console.log("hi")'], { runId });

        expect(commandRuns).toHaveBeenCalledTimes(1);
      })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a terminal interrupt [Then] it forwards the signal to the child process group and unregisters its handlers',
      () =>
        Effect.gen(function* () {
          const signalled: Array<readonly [number, string]> = [];
          vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
            signalled.push([Number(pid), String(signal)]);
            return true;
          });

          const sigintBaseline = process.listenerCount('SIGINT');
          const sigtermBaseline = process.listenerCount('SIGTERM');
          const registeredWhileRunning: Array<{ sigint: number; sigterm: number }> = [];

          commandRuns.mockImplementation(() =>
            Effect.sync(() => {
              registeredWhileRunning.push({
                sigint: process.listenerCount('SIGINT') - sigintBaseline,
                sigterm: process.listenerCount('SIGTERM') - sigtermBaseline,
              });
              // Stand in for the terminal delivering Ctrl-C to the CLI only: the child is
              // detached into its own process group and never sees it directly.
              for (const listener of process.listeners('SIGINT').slice(sigintBaseline)) {
                listener('SIGINT');
              }
              return ChildProcessSpawner.ExitCode(0);
            })
          );

          yield* cli(['run', 'console.log("hi")']);

          expect(registeredWhileRunning[0]).toEqual({ sigint: 1, sigterm: 1 });
          // Negative pid: the detached child leads its own process group.
          expect(signalled).toEqual([[-STUB_CHILD_PID, 'SIGINT']]);
          expect(process.listenerCount('SIGINT')).toBe(sigintBaseline);
          expect(process.listenerCount('SIGTERM')).toBe(sigtermBaseline);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] inline code and args [Then] it forwards them to the embedded Bun runtime',
      () =>
        Effect.gen(function* () {
          commandRuns.mockImplementation(() => Effect.succeed(ChildProcessSpawner.ExitCode(7)));

          yield* cli(['run', 'console.log("hi")', '--flag', 'value']);
          const output = yield* MockConsole.getLines();

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(spawnConfig.cmd[0]).toBe(process.execPath);
          expect(spawnConfig.cmd[1]).toBe('--preload');
          expect(spawnConfig.cmd[2]).toMatch(/globals\.mjs$/);
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(spawnConfig.cmd[4]).toContain('(async () => {');
          expect(spawnConfig.cmd[4]).toContain('return (console.log("hi"));');
          expect(spawnConfig.cmd[4]).toContain('if (__composioResult !== undefined) {');
          expect(spawnConfig.cmd.slice(5)).toEqual(['--', '--flag', 'value']);
          expect(spawnConfig.env).toEqual(expect.objectContaining({ BUN_BE_BUN: '1' }));
          expect(spawnConfig.extendEnv).toBe(true);
          expect(spawnConfig.stdio).toEqual(['inherit', 'inherit', 'inherit']);
          expect(output).toContainEqual(expect.stringMatching(/^RUN_LOG_FILE=.*run\.log$/));
          // The preload file lives in a scoped directory and is removed with it, ...
          expect(fs.existsSync(spawnConfig.cmd[2]!)).toBe(false);
          // ... but the run log is advertised to the caller on stderr, so it has to outlive
          // the run that printed it.
          const runLogPath = output
            .find(line => line.startsWith('RUN_LOG_FILE='))
            ?.slice('RUN_LOG_FILE='.length);
          expect(runLogPath).toBeDefined();
          expect(fs.existsSync(runLogPath!)).toBe(true);
          fs.rmSync(path.dirname(runLogPath!), { recursive: true, force: true });
          expect(process.exitCode).toBe(7);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect('[Given] a run [Then] the preload context carries no sub-agent inputs', () =>
      Effect.gen(function* () {
        let preloadSource = '';
        commandRuns.mockImplementation(command => {
          preloadSource = readRunPreloadSource(inspectRunCommand(command).cmd);
          return Effect.succeed(ChildProcessSpawner.ExitCode(0));
        });

        yield* cli(['run', 'console.log("hi")']);

        expect(preloadSource).toContain('"runLogFilePath":');
        expect(preloadSource).not.toContain('"master":');
        expect(preloadSource).not.toContain('"readAccessRoots":');
        expect(preloadSource).not.toContain('"cliConfigPath":');
      })
    );
  });

  layer(RunTestLive({ baseConfigProvider: enabledRuntimeFlagsConfigProvider }))(it => {
    it.effect(
      '[Given] COMPOSIO_RUN_ACP_ONLY=1 [Then] only the remaining debug flags reach the script',
      () =>
        Effect.gen(function* () {
          let preloadSource = '';
          commandRuns.mockImplementation(command => {
            preloadSource = readRunPreloadSource(inspectRunCommand(command).cmd);
            return Effect.succeed(ChildProcessSpawner.ExitCode(0));
          });

          yield* cli(['run', 'console.log("hi")']);

          const command = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(command.env).toEqual({
            BUN_BE_BUN: '1',
            COMPOSIO_CLI_PARENT_RUN_ID: expect.any(String),
            COMPOSIO_PERF_DEBUG: '1',
            COMPOSIO_TOOL_DEBUG: '1',
            COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
          });
          expect(preloadSource).toContain('"perfDebug":true');
          expect(preloadSource).toContain('"toolDebug":true');
          expect(preloadSource).toContain('"telemetryDebug":false');
          expect(preloadSource).not.toContain('acpOnly');
          expect(preloadSource).not.toContain('COMPOSIO_RUN_ACP_ONLY');
        })
    );

    it.effect('[Given] explicit false flags [Then] inherited true values are cleared', () =>
      Effect.gen(function* () {
        let preloadSource = '';
        commandRuns.mockImplementation(command => {
          preloadSource = readRunPreloadSource(inspectRunCommand(command).cmd);
          return Effect.succeed(ChildProcessSpawner.ExitCode(0));
        });

        yield* cli(['run', '--perf-debug=false', '--tool-debug=false', 'console.log("hi")']);

        const command = inspectRunCommand(commandRuns.mock.calls[0]![0]);
        expect(command.env).toMatchObject({
          COMPOSIO_PERF_DEBUG: '0',
          COMPOSIO_TOOL_DEBUG: '0',
          COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
        });
        expect(preloadSource).toContain('"perfDebug":false');
        expect(preloadSource).toContain('"toolDebug":false');
      })
    );
  });

  layer(Layer.merge(RunTestLive(), telemetryDebugModeLayer(true)))(it => {
    it.effect(
      '[Given] --telemetry-debug [Then] the spawned script and its children observe it',
      () =>
        Effect.gen(function* () {
          let preloadSource = '';
          commandRuns.mockImplementation(command => {
            preloadSource = readRunPreloadSource(inspectRunCommand(command).cmd);
            return Effect.succeed(ChildProcessSpawner.ExitCode(0));
          });

          yield* cli(['run', 'console.log("hi")']);

          const command = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(command.env.COMPOSIO_CLI_TELEMETRY_DEBUG).toBe('1');
          expect(preloadSource).toContain('"telemetryDebug":true');
        })
    );
  });

  layer(RunTestLive())(it => {
    for (const flag of [
      '--acp-only',
      '--acp-only=false',
      '--no-acp-only',
      '--logs-off',
      '--logs-off=false',
      '--no-logs-off',
      '--foo_bar',
      '--foo_bar=value',
    ]) {
      it.effect(`[Given] the unknown ${flag} [Then] run rejects it as an unknown flag`, () =>
        Effect.gen(function* () {
          const exit = yield* cli(['run', flag, 'console.log(1)']).pipe(Effect.exit);

          expect(Exit.isFailure(exit)).toBe(true);
          expect(commandRuns).not.toHaveBeenCalled();
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain(
            `Unrecognized flag: ${flag.split('=')[0]} in command composio run`
          );
        })
      );
    }

    it.effect('[Given] repeated invocations [Then] hidden flags do not leak', () =>
      Effect.gen(function* () {
        const preloadSources: string[] = [];
        commandRuns.mockImplementation(command => {
          preloadSources.push(readRunPreloadSource(inspectRunCommand(command).cmd));
          return Effect.succeed(ChildProcessSpawner.ExitCode(0));
        });

        yield* cli(['run', '--perf-debug', 'console.log("first")']);
        yield* cli(['run', 'console.log("second")']);

        expect(preloadSources).toHaveLength(2);
        expect(preloadSources[0]).toContain('"perfDebug":true');
        expect(preloadSources[1]).toContain('"perfDebug":false');
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

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(spawnConfig.cmd[4]).toContain('const issue = await execute(');
          expect(spawnConfig.cmd[4]).toContain('"Do not run terminal commands."');
          expect(spawnConfig.cmd[4]).toContain('].join("\\n"),');
          expect(spawnConfig.cmd[4]).toContain('owner: "acme"');
          expect(spawnConfig.cmd[4]).toContain('console.log(JSON.stringify(issue));');
          expect(spawnConfig.cmd[4]).toContain('return (console.log(JSON.stringify(issue.data)));');
          expect(spawnConfig.cmd[4]).not.toContain('"Do not run terminal\n');
          expect(process.exitCode).toBe(0);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect('[Given] --file [Then] it forwards file execution to the embedded Bun runtime', () =>
      Effect.gen(function* () {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-test-'));
        const scriptPath = path.join(tempDir, 'script.ts');
        fs.writeFileSync(scriptPath, 'const value = 1 + 1;\nvalue * 2;\n', 'utf8');
        try {
          yield* cli(['run', '--file', scriptPath, '--', 'hello']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(spawnConfig.cmd[0]).toBe(process.execPath);
          expect(spawnConfig.cmd[1]).toBe('--preload');
          expect(spawnConfig.cmd[2]).toMatch(/globals\.mjs$/);
          expect(spawnConfig.cmd[3]).toMatch(/\.composio-run-.*\.ts$/);
          expect(spawnConfig.cmd[4]).toBe('--');
          expect(spawnConfig.cmd[5]).toBe('hello');
          expect(spawnConfig.env).toEqual(expect.objectContaining({ BUN_BE_BUN: '1' }));
          expect(spawnConfig.extendEnv).toBe(true);
          expect(spawnConfig.stdio).toEqual(['inherit', 'inherit', 'inherit']);
          expect(fs.existsSync(spawnConfig.cmd[2]!)).toBe(false);
          expect(fs.existsSync(spawnConfig.cmd[3]!)).toBe(false);
          expect(process.exitCode).toBe(0);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] no inline code and no --file [Then] it fails with a typed usage error, not a defect',
      () =>
        Effect.gen(function* () {
          const exit = yield* cli(['run']).pipe(Effect.exit);
          expect(Exit.isFailure(exit)).toBe(true);
          if (!Exit.isFailure(exit)) return;

          const failure = Cause.findErrorOption(exit.cause);
          expect(Option.isSome(failure)).toBe(true);
          expect(failure.pipe(Option.getOrThrow)).toBeInstanceOf(MissingRunSourceError);
          expect(
            String((failure.pipe(Option.getOrThrow) as MissingRunSourceError).message)
          ).toContain('Provide inline code or use --file to run a script file.');
          // Nothing was set up before the check, so no child process was started.
          expect(commandRuns).not.toHaveBeenCalled();
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] --file=path inline form followed by --dry-run [Then] both parse as run flags',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-test-'));
          const scriptPath = path.join(tempDir, 'script.ts');
          fs.writeFileSync(scriptPath, 'const value = 1 + 1;\nvalue * 2;\n', 'utf8');

          try {
            yield* cli(['run', `--file=${scriptPath}`, '--dry-run']);

            expect(commandRuns).toHaveBeenCalledTimes(1);
            const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
            // `--file=...` must be recognized as a run flag: file mode compiles a
            // wrapper script (not `--eval` inline code), and `--dry-run` must not
            // leak into the forwarded script arguments.
            expect(spawnConfig.cmd[3]).toMatch(/\.composio-run-.*\.ts$/);
            expect(spawnConfig.cmd).not.toContain('--dry-run');
            expect(process.exitCode).toBe(0);
          } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      'forwards script flags with or without a delimiter without enabling them in the CLI',
      () =>
        Effect.gen(function* () {
          const script = 'console.log("hi")';
          const tail = ['--perf-debug', '--tool-debug', '--telemetry-debug', '--help', '--version'];
          for (const args of [
            [script, ...tail],
            [script, '--', ...tail],
            ['--', script, ...tail],
          ]) {
            yield* cli(['--perf-debug=false', 'run', ...args]);
            const spawned = inspectRunCommand(commandRuns.mock.calls.at(-1)![0]);
            expect(spawned.cmd.slice(5)).toEqual(['--', ...tail]);
            expect(spawned.env).toMatchObject({
              COMPOSIO_PERF_DEBUG: '0',
              COMPOSIO_TOOL_DEBUG: '0',
              COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
            });
          }
          expect(commandRuns).toHaveBeenCalledTimes(3);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a second literal -- in passthrough args [Then] it is forwarded to the script',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', 'console.log("hi")', '--', 'alpha', '--', 'beta']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          // First `--` is the run/script boundary; the second is a script
          // argument and must reach the script verbatim (v3 behavior).
          expect(spawnConfig.cmd.slice(5)).toEqual(['--', 'alpha', '--', 'beta']);
          expect(process.exitCode).toBe(0);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a script arg literally starting with the old escape-marker string [Then] it reaches the script untouched',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', 'console.log("hi")', '@@composio-run-raw@@literal']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(spawnConfig.cmd.slice(5)).toEqual(['--', '@@composio-run-raw@@literal']);
          expect(process.exitCode).toBe(0);
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

describe('buildRunHelpersSource', () => {
  it('[Given] consumer context [Then] it embeds auth and consumer metadata in the helper source', () => {
    const source = buildRunHelpersSource(
      ['/tmp/composio'],
      {
        apiKey: 'test_api_key',
        baseURL: 'https://api.example.test',
        webURL: 'https://app.example.test',
        orgId: 'org_test',
        consumerUserId: 'consumer_user_test',
        dryRun: true,
        runLogFilePath: '/tmp/composio-run/run.log',
      },
      {
        helpersRuntimeModuleUrl: pathToFileURL('/tmp/composio-run/run-helpers-runtime.mjs').href,
      }
    );

    expect(source).toContain('import { installRunHelpers } from "file://');
    expect(source).toContain('await installRunHelpers(');
    expect(source).toContain('"cliPrefix":["/tmp/composio"]');
    expect(source).toContain('"runLogFilePath":"/tmp/composio-run/run.log"');
    expect(source).toContain('"consumerUserId":"consumer_user_test"');
    expect(source).not.toContain('globalThis.execute = async (slug, data = {}) => {');
  });
});

describe('inferCliInvocationPrefix', () => {
  layer(BunServices.layer)(it => {
    it.effect(
      '[Given] a compiled bunfs entrypoint [Then] it falls back to the binary path only',
      () =>
        Effect.gen(function* () {
          const pathService = yield* Path.Path;
          expect(
            yield* inferCliInvocationPrefix(pathService, ['node', '/$bunfs/root/composio'])
          ).toEqual([process.execPath]);
        })
    );
  });
});

describe('resolveRunCompanionModulePath', () => {
  layer(BunServices.layer)(it => {
    it.effect(
      '[Given] a bundled dist chunk [Then] it resolves sibling companion modules in dist',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-companion-dist-'));
          const callerPath = path.join(tempDir, 'commands-abc.mjs');
          const servicesDir = path.join(tempDir, 'services');
          const companionPath = path.join(servicesDir, 'run-helpers-runtime.mjs');
          fs.writeFileSync(callerPath, '', 'utf8');
          fs.mkdirSync(servicesDir);
          fs.writeFileSync(companionPath, '', 'utf8');

          expect(
            yield* resolveRunCompanionModulePath({
              callerImportMetaUrl: pathToFileURL(callerPath).href,
              execPath: '/tmp/composio',
              relativeNoExtensionFromCaller: '../services/run-helpers-runtime',
            })
          ).toBe(companionPath);
        })
    );

    it.effect(
      '[Given] a compiled bunfs caller [Then] it falls back to modules next to the binary',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-companion-bin-'));
          const execPath = path.join(tempDir, 'composio');
          const companionPath = path.join(tempDir, 'run-helpers-runtime.mjs');
          fs.writeFileSync(companionPath, '', 'utf8');

          expect(
            yield* resolveRunCompanionModulePath({
              callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
              execPath,
              relativeNoExtensionFromCaller: '../services/run-helpers-runtime',
            })
          ).toBe(companionPath);
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

    it.effect(
      '[Given] a partial companion install [Then] it reports only the missing companion files',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-missing-'));
          const execPath = path.join(tempDir, 'composio');
          fs.writeFileSync(path.join(tempDir, RUN_COMPANION_MODULE_FILENAMES[0]!), '', 'utf8');

          expect(yield* listMissingInstalledRunCompanionModules(execPath)).toEqual(
            RUN_COMPANION_MODULE_FILENAMES.slice(1).slice().sort()
          );
        })
    );

    it.effect(
      '[Given] a nested companion dependency is missing [Then] it reports the missing helper asset',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-missing-nested-'));
          const execPath = path.join(tempDir, 'composio');
          const servicesDir = path.join(tempDir, 'services');
          fs.mkdirSync(servicesDir, { recursive: true });

          fs.writeFileSync(
            path.join(tempDir, 'run-helpers-runtime.mjs'),
            'export * from "./services/run-helpers-runtime.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'generation-runtime.mjs'),
            'export * from "./services/generation-runtime.mjs";\n',
            'utf8'
          );

          fs.writeFileSync(
            path.join(servicesDir, 'run-helpers-runtime.mjs'),
            'export const runtimeValue = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'generation-runtime.mjs'),
            'export * from "../run-companion-modules-abc123.mjs";\n',
            'utf8'
          );

          expect(yield* listMissingInstalledRunCompanionModules(execPath)).toEqual([
            'run-companion-modules-abc123.mjs',
          ]);
        })
    );

    it.effect(
      '[Given] a named re-export dependency is missing [Then] it reports the missing helper asset',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-missing-reexport-'));
          const execPath = path.join(tempDir, 'composio');
          const servicesDir = path.join(tempDir, 'services');
          fs.mkdirSync(servicesDir, { recursive: true });

          fs.writeFileSync(
            path.join(tempDir, 'run-helpers-runtime.mjs'),
            'export * from "./services/run-helpers-runtime.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'generation-runtime.mjs'),
            'export * from "./services/generation-runtime.mjs";\n',
            'utf8'
          );

          fs.writeFileSync(
            path.join(servicesDir, 'run-helpers-runtime.mjs'),
            'export const runtimeValue = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'generation-runtime.mjs'),
            'export { helperValue } from "../run-companion-modules-def456.mjs";\n',
            'utf8'
          );

          expect(yield* listMissingInstalledRunCompanionModules(execPath)).toEqual([
            'run-companion-modules-def456.mjs',
          ]);
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

describe('wrapInlineCodeForRun', () => {
  it('[Given] inline code ending in an expression [Then] it rewrites the last expression to a return', () => {
    expect(
      wrapInlineCodeForRun(`
        const value = 1 + 1;
        value * 2;
      `)
    ).toContain('return (value * 2);');
  });
});
