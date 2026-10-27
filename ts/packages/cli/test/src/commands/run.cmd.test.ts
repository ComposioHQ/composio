import { CommandInputError } from 'src/commands/errors';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, layer } from '@effect/vitest';
import { assertDefined } from '@effect/vitest/utils';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as Path from 'effect/Path';
import {
  Cause,
  ConfigProvider,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  PlatformError,
  Runtime,
  Sink,
  Stream,
} from 'effect';
import { TestClock } from 'effect/testing';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { afterEach, beforeEach, it, vi } from 'vitest';
import { buildRunHelpersSource, inferCliInvocationPrefix } from 'src/commands/run.cmd';
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
import { telemetryDebugModeLayer } from 'src/services/runtime-flags';
import { cli, MockConsole, recordedInvocationCalls, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { CommandRunner } from 'src/services/command-runner';
import { ChildProcessExited, ChildProcessSignaled } from 'src/effects/child-process-exited';
import { ExitAction, exitActionFor } from 'src/run-main';
import {
  makeShutdownController,
  ShutdownSignal,
  type ShutdownController,
  type TerminationSignal,
} from 'src/services/shutdown-signal';

const enabledRuntimeFlagsConfigProvider = ConfigProvider.fromEnvRecord({
  COMPOSIO_RUN_ACP_ONLY: '1',
  COMPOSIO_PERF_DEBUG: '1',
  COMPOSIO_TOOL_DEBUG: '1',
});

/** The run command is `[bun, '--preload', preloadPath, ...]`. */
const readRunPreloadSource = (command: ReadonlyArray<string>): string =>
  fs.readFileSync(String(command[2]), 'utf8');

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

const commandRuns = vi.fn(
  (
    _: ChildProcess.Command
  ): Effect.Effect<ChildProcessSpawner.ExitCode, PlatformError.PlatformError> =>
    Effect.succeed(ChildProcessSpawner.ExitCode(0))
);
/** Whether the stub child is still running, which the escalation after a signal checks. */
const childRunning = vi.fn(() => false);

// `composio run` starts the child through the platform `ChildProcessSpawner` so it owns the
// pid it forwards signals to, so the stub has to replace the spawner rather than
// `CommandRunner`. `exitCode` stays suspended: the command only awaits it after the signal
// handlers are registered, which is what makes the forwarding observable below.
const STUB_CHILD_PID = 987_654;

const stubHandle = (command: ChildProcess.Command): ChildProcessSpawner.ChildProcessHandle =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(STUB_CHILD_PID),
    exitCode: Effect.suspend(() => commandRuns(command)),
    isRunning: Effect.sync(() => childRunning()),
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
    commandRuns
      .mockReset()
      .mockImplementation(() => Effect.succeed(ChildProcessSpawner.ExitCode(0)));
    childRunning.mockReset().mockImplementation(() => false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a root run [Then] the child receives the run id its telemetry recorded',
      () =>
        Effect.gen(function* () {
          let childRunId: string | undefined;
          commandRuns.mockImplementation(command => {
            childRunId = inspectRunCommand(command).env.COMPOSIO_CLI_PARENT_RUN_ID;
            return Effect.succeed(ChildProcessSpawner.ExitCode(0));
          });

          // The invocation mints the run id for its telemetry and hands it to the command, instead
          // of publishing it through process-wide state.
          yield* cli(['--telemetry-debug', 'run', 'console.log("hi")']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const invoked = (yield* recordedInvocationCalls).find(
            call => call.service === 'CommandLifecycleTelemetry' && call.event === 'invoked'
          );
          const runId =
            invoked?.service === 'CommandLifecycleTelemetry' && invoked.event === 'invoked'
              ? invoked.context.runId
              : undefined;
          assertDefined(runId);
          expect(childRunId).toBe(runId);
        })
    );
  });

  describe('signals', () => {
    // The runner's controller for this run: the test delivers the CLI's signals through it.
    let controller: ShutdownController = makeShutdownController();
    const signalled: Array<readonly [number, string]> = [];
    // Completes once `process.kill` received each signal, so a test can wait for delivery.
    let delivered = new Map<string, Deferred.Deferred<void>>();
    const deliveryOf = (signal: string) => {
      const deferred = delivered.get(signal) ?? Deferred.makeUnsafe<void>();
      delivered.set(signal, deferred);
      return deferred;
    };

    beforeEach(() => {
      controller = makeShutdownController();
      signalled.length = 0;
      delivered = new Map();
      vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        signalled.push([Number(pid), String(signal)]);
        Deferred.doneUnsafe(deliveryOf(String(signal)), Effect.void);
        return true;
      });
    });

    /** `composio run` with the CLI receiving `signal` while the child runs. */
    const runWithSignals = Effect.suspend(() =>
      Effect.exit(
        cli(['run', 'console.log("hi")']).pipe(
          Effect.provideService(ShutdownSignal, controller.service)
        )
      )
    );

    /** A child that, once the CLI took `signal`, waits for it and then ends with `ends`. */
    const childEndingAfter = (
      signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP',
      ends: Effect.Effect<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>
    ) =>
      commandRuns.mockImplementation(() =>
        Effect.sync(() => expect(controller.offer(signal)).toBe(true)).pipe(
          Effect.andThen(Deferred.await(deliveryOf(signal))),
          Effect.andThen(ends)
        )
      );

    /** The spawner's failure for a child a signal ended. */
    const killedBy = (signal: TerminationSignal) =>
      Effect.fail(
        PlatformError.systemError({
          _tag: 'Unknown',
          module: 'ChildProcess',
          method: 'exitCode',
          cause: new Error(`Process interrupted due to receipt of signal: '${signal}'`),
        })
      );

    layer(RunTestLive())(it => {
      it.effect.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)(
        '[Given] the CLI receives %s [Then] it forwards it to the child process group',
        signal =>
          Effect.gen(function* () {
            childEndingAfter(signal, Effect.succeed(ChildProcessSpawner.ExitCode(0)));

            const exit = yield* runWithSignals;

            // Negative pid: the detached child leads its own process group.
            expect(signalled).toEqual([[-STUB_CHILD_PID, signal]]);
            // A script that handles the signal and exits 0 makes the run succeed.
            expect(exitCodeOf(exit)).toBe(0);
          })
      );

      it.effect(
        '[Given] the child exits non-zero after the signal [Then] the run mirrors its code',
        () =>
          Effect.gen(function* () {
            childEndingAfter('SIGINT', Effect.succeed(ChildProcessSpawner.ExitCode(7)));

            const exit = yield* runWithSignals;

            expect(exitCodeOf(exit)).toBe(7);
          })
      );

      it.effect('[Given] the signal ends the child [Then] the runner re-raises that signal', () =>
        Effect.gen(function* () {
          childEndingAfter('SIGTERM', killedBy('SIGTERM'));

          const exit = yield* runWithSignals;
          const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;

          expect(failure).toBeInstanceOf(ChildProcessSignaled);
          expect(Runtime.getErrorReported(failure)).toBe(false);
          expect(exitActionFor(exit, Option.some('SIGTERM'))).toEqual(
            ExitAction.Reraise({ signal: 'SIGTERM' })
          );
        })
      );

      it.effect(
        '[Given] a child that ignores the signal [Then] it gets SIGTERM, then SIGKILL, and the run mirrors SIGKILL',
        () =>
          Effect.gen(function* () {
            childRunning.mockImplementation(() => true);
            const killed = deliveryOf('SIGKILL');
            childEndingAfter(
              'SIGINT',
              Deferred.await(killed).pipe(Effect.andThen(killedBy('SIGKILL')))
            );

            const fiber = yield* Effect.forkChild(runWithSignals);
            yield* Deferred.await(deliveryOf('SIGINT'));
            yield* TestClock.adjust('2 seconds');
            yield* Deferred.await(deliveryOf('SIGTERM'));
            yield* TestClock.adjust('2 seconds');
            const exit = yield* Fiber.join(fiber);

            expect(signalled).toEqual([
              [-STUB_CHILD_PID, 'SIGINT'],
              [-STUB_CHILD_PID, 'SIGTERM'],
              [-STUB_CHILD_PID, 'SIGKILL'],
            ]);
            expect(exitActionFor(exit, Option.some('SIGINT'))).toEqual(
              ExitAction.Reraise({ signal: 'SIGKILL' })
            );
          })
      );

      it.effect(
        '[Given] a second signal [Then] forcing the exit kills the child group and re-raises',
        () =>
          Effect.gen(function* () {
            const forced = yield* Deferred.make<{ readonly reraise: boolean }>();
            commandRuns.mockImplementation(() =>
              Effect.sync(() => {
                controller.offer('SIGINT');
                // What the runner does on the second signal, while the child still runs.
                Deferred.doneUnsafe(forced, Effect.succeed(controller.force()));
                return ChildProcessSpawner.ExitCode(0);
              })
            );

            yield* runWithSignals;

            expect(yield* Deferred.await(forced)).toEqual({ reraise: true });
            expect(signalled).toContainEqual([-STUB_CHILD_PID, 'SIGKILL']);
          })
      );
    });
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] inline code and args [Then] it forwards them to the embedded Bun runtime',
      () =>
        Effect.gen(function* () {
          commandRuns.mockImplementation(() => Effect.succeed(ChildProcessSpawner.ExitCode(7)));

          const exit = yield* Effect.exit(cli(['run', 'console.log("hi")', '--flag', 'value']));
          const output = yield* MockConsole.getLines();

          // The process exits with the child's code.
          expect(exitCodeOf(exit)).toBe(7);
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
          const runLogPath = String(output.find(line => line.startsWith('RUN_LOG_FILE='))).slice(
            'RUN_LOG_FILE='.length
          );
          expect(fs.existsSync(runLogPath)).toBe(true);
          fs.rmSync(path.dirname(runLogPath), { recursive: true, force: true });
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect(
      '[Given] a child that exits non-zero [Then] it fails with ChildProcessExited, which the runtime does not log',
      () =>
        Effect.gen(function* () {
          commandRuns.mockImplementation(() => Effect.succeed(ChildProcessSpawner.ExitCode(3)));

          const failure = yield* cli(['run', 'console.log("hi")']).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(ChildProcessExited);
          expect(failure).toMatchObject({ code: 3 });
          // The child already wrote its own output; `BunRuntime.runMain` must not add a log.
          expect(Runtime.getErrorReported(failure)).toBe(false);
        })
    );

    it.effect('[Given] a child that exits 0 [Then] the run succeeds', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['run', 'console.log("hi")']));

        expect(exitCodeOf(exit)).toBe(0);
      })
    );

    // Ctrl-C interrupts the run while the child is still running: the process exits 130, not 0,
    // so wrappers and `set -e` scripts do not read a cancelled run as a passing one.
    it.effect('[Given] the run is interrupted [Then] the process exits 130', () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        commandRuns.mockImplementation(() =>
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))
        );

        const fiber = yield* Effect.forkChild(cli(['run', 'console.log("hi")']));
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);

        expect(exitCodeOf(yield* Fiber.await(fiber))).toBe(130);
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
            let preloadSource = '';
            commandRuns.mockImplementation(command => {
              preloadSource = readRunPreloadSource(inspectRunCommand(command).cmd);
              return Effect.succeed(ChildProcessSpawner.ExitCode(0));
            });

            yield* cli(['run', 'console.log("hi")']);

            expect(preloadSource).toContain('"baseURL":');
            expect(preloadSource.includes('"webURL":')).toBe(testCase.forwarded);
          })
      );
    });
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
        expect(commandRuns).not.toHaveBeenCalled();
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain(`Unrecognized flag: ${name} in command composio run`);
      })
    );

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
        })
    );
  });

  layer(RunTestLive())(it => {
    it.effect('[Given] --file [Then] it forwards file execution to the embedded Bun runtime', () =>
      Effect.gen(function* () {
        const { scriptPath } = yield* tempScript;
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
          const { scriptPath } = yield* tempScript;
          yield* cli(['run', `--file=${scriptPath}`, '--dry-run']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          // `--file=...` must be recognized as a run flag: file mode compiles a
          // wrapper script (not `--eval` inline code), and `--dry-run` must not
          // leak into the forwarded script arguments.
          expect(spawnConfig.cmd[3]).toMatch(/\.composio-run-.*\.ts$/);
          expect(spawnConfig.cmd).not.toContain('--dry-run');
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

        expect(commandRuns).toHaveBeenCalledTimes(1);
        const spawned = inspectRunCommand(commandRuns.mock.calls[0]![0]);
        expect(spawned.cmd.slice(5)).toEqual(['--', ...SCRIPT_FLAGS]);
        expect(spawned.env).toMatchObject({
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

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          // First `--` is the run/script boundary; the second is a script
          // argument and must reach the script verbatim (v3 behavior).
          expect(spawnConfig.cmd.slice(5)).toEqual(['--', 'alpha', '--', 'beta']);
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
