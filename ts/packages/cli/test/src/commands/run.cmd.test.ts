import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, layer } from '@effect/vitest';
import { Command as PlatformCommand, CommandExecutor, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import {
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  HashMap,
  Inspectable,
  Layer,
  Option,
  Sink,
  Stream,
} from 'effect';
import { afterEach, it, vi } from 'vitest';
import { createCliCommandTelemetryContext } from 'src/analytics/events';
import {
  buildRunHelpersSource,
  extractInlineExecuteToolSlugs,
  inferCliInvocationPrefix,
  MissingRunSourceError,
  wrapInlineCodeForRun,
} from 'src/commands/run.cmd';
import {
  RUN_COMPANION_MODULE_FILENAMES,
  hasInstalledRunCompanionModules,
  hostRunCompanionStaticAssetRelativePaths,
  listMissingInstalledRunCompanionModules,
  readInstalledReleaseTag,
  resolveRunCompanionModulePath,
  writeInstalledReleaseTag,
} from 'src/services/run-companion-modules';
import {
  ACP_STRUCTURED_OUTPUT_WRAPPER_KEY,
  buildStructuredRepairPrompt,
  buildStructuredOutputToolSchema,
  buildStructuredPrompt,
  buildStructuredToolPrompt,
  finalizeInvokeAgentText,
} from 'src/services/run-subagent-shared';
import { extendConfigProvider } from 'src/services/config';
import { telemetryDebugModeLayer } from 'src/services/runtime-flags';
import { DEFAULT_CLI_INVOCATION_ORIGIN } from 'src/services/runtime-cli-context';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { CommandRunner } from 'src/services/command-runner';

const acpOnlyConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_RUN_ACP_ONLY', '1']])
).pipe(extendConfigProvider);

const enabledRuntimeFlagsConfigProvider = ConfigProvider.fromMap(
  new Map([
    ['COMPOSIO_RUN_ACP_ONLY', '1'],
    ['COMPOSIO_PERF_DEBUG', '1'],
    ['COMPOSIO_TOOL_DEBUG', '1'],
  ])
).pipe(extendConfigProvider);

const readRunPreloadSource = (command: ReadonlyArray<string>): string => {
  const preloadPath = command[2];
  if (preloadPath === undefined) {
    throw new Error('Expected the run command to include a preload file.');
  }
  return fs.readFileSync(preloadPath, 'utf8');
};

const commandRuns = vi.fn((_: PlatformCommand.Command) =>
  Effect.succeed(CommandExecutor.ExitCode(0))
);

// `composio run` starts the child through the platform `CommandExecutor` so it owns the pid it
// forwards signals to, so the stub has to replace the executor rather than `CommandRunner`.
// `exitCode` stays suspended: the command only awaits it after the signal handlers are
// registered, which is what makes the forwarding observable below.
const STUB_CHILD_PID = 987_654;

const stubProcess = (command: PlatformCommand.Command): CommandExecutor.Process => ({
  [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
  pid: CommandExecutor.ProcessId(STUB_CHILD_PID),
  exitCode: Effect.suspend(() => commandRuns(command)),
  isRunning: Effect.succeed(false),
  kill: () => Effect.void,
  stdin: Sink.drain,
  stdout: Stream.empty,
  stderr: Stream.empty,
  toJSON: () => ({ _id: 'StubProcess' }),
  toString: () => 'StubProcess',
  [Inspectable.NodeInspectSymbol]: () => ({ _id: 'StubProcess' }),
});

const StubCommandExecutor = Layer.succeed(
  CommandExecutor.CommandExecutor,
  CommandExecutor.makeExecutor(command => Effect.succeed(stubProcess(command)))
);

const RunTestLive = (input: Parameters<typeof TestLive>[0] = {}) =>
  Layer.merge(
    TestLive({
      ...input,
      commandRunner: new CommandRunner({
        run: command => commandRuns(command),
        capture: () => Effect.succeed({ exitCode: 0, stdout: '', stderr: '' }),
      }),
    }),
    StubCommandExecutor
  );

const inspectRunCommand = (command: PlatformCommand.Command) => {
  const [standard] = PlatformCommand.flatten(command);
  return {
    cmd: [standard.command, ...standard.args],
    env: Object.fromEntries(HashMap.entries(standard.env)),
    extendEnv: standard.extendEnv,
    stdio: [standard.stdin, standard.stdout, standard.stderr],
  };
};

describe('CLI: composio run', () => {
  afterEach(() => {
    process.exitCode = undefined;
    commandRuns.mockReset().mockImplementation(() => Effect.succeed(CommandExecutor.ExitCode(0)));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  layer(RunTestLive())(it => {
    it.scoped('[Given] a root run telemetry id [Then] the child receives the same run id', () =>
      Effect.gen(function* () {
        const telemetryContext = createCliCommandTelemetryContext(
          ['bun', 'composio', 'run', 'console.log("hi")'],
          '0.0.0-test',
          { stdoutIsTTY: false, stderrIsTTY: false },
          { invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN, parentRunId: undefined }
        );
        const runId = telemetryContext.runId;
        expect(runId).toBeDefined();
        if (runId === undefined) return;

        commandRuns.mockImplementation(command => {
          expect(inspectRunCommand(command).env.COMPOSIO_CLI_PARENT_RUN_ID).toBe(runId);
          return Effect.succeed(CommandExecutor.ExitCode(0));
        });

        // The bootstrap hands the run id it minted for telemetry to the command, the way
        // `cli-main.ts` does, instead of publishing it through process-wide state.
        yield* cli(['run', 'console.log("hi")'], { runId });

        expect(commandRuns).toHaveBeenCalledTimes(1);
      })
    );
  });

  layer(RunTestLive())(it => {
    it.scoped(
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
              return CommandExecutor.ExitCode(0);
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
    it.scoped(
      '[Given] inline code and args [Then] it forwards them to the embedded Bun runtime',
      () =>
        Effect.gen(function* () {
          commandRuns.mockImplementation(() => Effect.succeed(CommandExecutor.ExitCode(7)));

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

  layer(RunTestLive({ baseConfigProvider: acpOnlyConfigProvider }))(it => {
    it.scoped(
      '[Given] COMPOSIO_RUN_ACP_ONLY=1 [Then] run enables ACP-only execution without a flag',
      () =>
        Effect.gen(function* () {
          commandRuns.mockImplementation(command => {
            expect(readRunPreloadSource(inspectRunCommand(command).cmd)).toContain(
              '"acpOnly":true'
            );
            return Effect.succeed(CommandExecutor.ExitCode(0));
          });

          yield* cli(['run', 'console.log("hi")']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
        })
    );

    it.scoped('[Given] --acp-only=false and configured ACP-only mode [Then] the flag wins', () =>
      Effect.gen(function* () {
        commandRuns.mockImplementation(command => {
          expect(readRunPreloadSource(inspectRunCommand(command).cmd)).toContain('"acpOnly":false');
          return Effect.succeed(CommandExecutor.ExitCode(0));
        });

        yield* cli(['run', '--acp-only=false', 'console.log("hi")']);

        expect(commandRuns).toHaveBeenCalledTimes(1);
      })
    );
  });

  layer(RunTestLive({ baseConfigProvider: enabledRuntimeFlagsConfigProvider }))(it => {
    it.scoped('[Given] explicit false flags [Then] inherited true values are cleared', () =>
      Effect.gen(function* () {
        let preloadSource = '';
        commandRuns.mockImplementation(command => {
          preloadSource = readRunPreloadSource(inspectRunCommand(command).cmd);
          return Effect.succeed(CommandExecutor.ExitCode(0));
        });

        yield* cli([
          'run',
          '--perf-debug=false',
          '--tool-debug=false',
          '--acp-only=false',
          'console.log("hi")',
        ]);

        const command = inspectRunCommand(commandRuns.mock.calls[0]![0]);
        expect(command.env).toMatchObject({
          COMPOSIO_PERF_DEBUG: '0',
          COMPOSIO_TOOL_DEBUG: '0',
          COMPOSIO_RUN_ACP_ONLY: '0',
          COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
        });
        expect(preloadSource).toContain('"acpOnly":false');
      })
    );
  });

  layer(Layer.merge(RunTestLive(), telemetryDebugModeLayer(true)))(it => {
    it.scoped(
      '[Given] --telemetry-debug [Then] the spawned script and its children observe it',
      () =>
        Effect.gen(function* () {
          let preloadSource = '';
          commandRuns.mockImplementation(command => {
            preloadSource = readRunPreloadSource(inspectRunCommand(command).cmd);
            return Effect.succeed(CommandExecutor.ExitCode(0));
          });

          yield* cli(['run', 'console.log("hi")']);

          const command = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(command.env.COMPOSIO_CLI_TELEMETRY_DEBUG).toBe('1');
          expect(preloadSource).toContain('"telemetryDebug":true');
        })
    );
  });

  layer(RunTestLive())(it => {
    it.scoped(
      '[Given] --acp-only [Then] run accepts the flag and forwards execution normally',
      () =>
        Effect.gen(function* () {
          commandRuns.mockImplementation(command => {
            expect(readRunPreloadSource(inspectRunCommand(command).cmd)).toContain(
              '"acpOnly":true'
            );
            return Effect.succeed(CommandExecutor.ExitCode(0));
          });

          yield* cli(['run', '--acp-only', 'console.log("hi")']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(process.exitCode).toBe(0);
        })
    );

    it.scoped('[Given] repeated invocations [Then] hidden flags do not leak', () =>
      Effect.gen(function* () {
        const preloadSources: string[] = [];
        commandRuns.mockImplementation(command => {
          preloadSources.push(readRunPreloadSource(inspectRunCommand(command).cmd));
          return Effect.succeed(CommandExecutor.ExitCode(0));
        });

        yield* cli(['run', '--acp-only', 'console.log("first")']);
        yield* cli(['run', 'console.log("second")']);

        expect(preloadSources).toHaveLength(2);
        expect(preloadSources[0]).toContain('"acpOnly":true');
        expect(preloadSources[1]).toContain('"acpOnly":false');
      })
    );
  });

  layer(RunTestLive())(it => {
    it.scoped(
      '[Given] --logs-off [Then] run accepts the flag and forwards execution normally',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', '--logs-off', 'console.log("hi")']);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(process.exitCode).toBe(0);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.scoped(
      '[Given] a multiline structured experimental_subAgent script [Then] run preserves the inline TypeScript source',
      () =>
        Effect.gen(function* () {
          const script = `
            const brief = await experimental_subAgent(
              [
                "Do not read files.",
                "Do not run terminal commands.",
                "Do not inspect the workspace.",
                "Return exactly this structured value:",
                "{\\"summary\\":\\"ok\\",\\"urgent\\":[\\"a\\",\\"b\\"]}",
              ].join("\\n"),
              {
                target: "codex",
                schema: z.object({ summary: z.string(), urgent: z.array(z.string()) }),
              }
            );
            console.log(JSON.stringify(brief));
            console.log(JSON.stringify(brief.structuredOutput));
          `;
          yield* cli(['run', '--logs-off', script]);

          expect(commandRuns).toHaveBeenCalledTimes(1);
          const spawnConfig = inspectRunCommand(commandRuns.mock.calls[0]![0]);
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(spawnConfig.cmd[4]).toContain('const brief = await experimental_subAgent(');
          expect(spawnConfig.cmd[4]).toContain('"Do not run terminal commands."');
          expect(spawnConfig.cmd[4]).toContain('].join("\\n"),');
          expect(spawnConfig.cmd[4]).toContain('target: "codex"');
          expect(spawnConfig.cmd[4]).toContain('console.log(JSON.stringify(brief));');
          expect(spawnConfig.cmd[4]).toContain(
            'return (console.log(JSON.stringify(brief.structuredOutput)));'
          );
          expect(spawnConfig.cmd[4]).not.toContain('"Do not run terminal\n');
          expect(process.exitCode).toBe(0);
        })
    );
  });

  layer(RunTestLive())(it => {
    it.scoped('[Given] --file [Then] it forwards file execution to the embedded Bun runtime', () =>
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
    it.scoped(
      '[Given] no inline code and no --file [Then] it fails with a typed usage error, not a defect',
      () =>
        Effect.gen(function* () {
          const exit = yield* cli(['run']).pipe(Effect.exit);
          expect(Exit.isFailure(exit)).toBe(true);
          if (!Exit.isFailure(exit)) return;

          const failure = Cause.failureOption(exit.cause);
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
    it.scoped(
      '[Given] run help [Then] it documents injected execute, search, proxy, experimental_subAgent, and z helpers',
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
          expect(output).toContain('--logs-off');
          expect(output).toContain('experimental_subAgent');
          expect(output).toContain('schema: z.object');
          expect(output).toContain('INJECTED HELPERS');
          expect(output).toContain('Global from zod');
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
        acpOnly: true,
        logsOff: true,
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
    expect(source).toContain('"acpOnly":true');
    expect(source).toContain('"logsOff":true');
    expect(source).toContain('"runLogFilePath":"/tmp/composio-run/run.log"');
    expect(source).toContain('"consumerUserId":"consumer_user_test"');
    expect(source).not.toContain('globalThis.execute = async (slug, data = {}) => {');
  });
});

describe('run-subagent-shared', () => {
  it('[Given] a structured schema [Then] it appends a strict JSON response contract', () => {
    expect(buildStructuredPrompt('hello', { type: 'object' })).toContain(
      'Return only a valid JSON value that matches this schema.'
    );
  });

  it('[Given] a non-object structured schema [Then] the MCP output tool schema wraps it under a value key', () => {
    expect(buildStructuredOutputToolSchema({ type: 'array', items: { type: 'string' } })).toEqual({
      type: 'object',
      additionalProperties: false,
      required: [ACP_STRUCTURED_OUTPUT_WRAPPER_KEY],
      properties: {
        [ACP_STRUCTURED_OUTPUT_WRAPPER_KEY]: { type: 'array', items: { type: 'string' } },
      },
    });
  });

  it('[Given] structured tool mode [Then] the prompt instructs the agent to use the output tool', () => {
    expect(
      buildStructuredToolPrompt(
        'Summarize it.',
        { type: 'array', items: { type: 'string' } },
        'submit_structured_output'
      )
    ).toContain('call the MCP tool `submit_structured_output` exactly once');
  });

  it('[Given] a repair prompt [Then] it requires no more tools and JSON-only fallback', () => {
    const prompt = buildStructuredRepairPrompt(
      { type: 'object', properties: { summary: { type: 'string' } } },
      'submit_structured_output'
    );

    expect(prompt).toContain('Your previous response was not valid structured output.');
    expect(prompt).toContain('Do not read files. Do not run terminal commands.');
    expect(prompt).toContain('reply with only raw JSON matching the schema');
  });

  it('[Given] Zod-like structured output [Then] it validates and returns structured data', () => {
    const result = finalizeInvokeAgentText('{"ok":true}', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { ok: true },
    });
  });

  it('[Given] plain text output [Then] it omits structuredOutput', () => {
    const result = finalizeInvokeAgentText('hello', {});

    expect(result).toEqual({
      result: 'hello',
    });
    expect('structuredOutput' in result).toBe(false);
  });

  it('[Given] invalid JSON in structured mode [Then] it throws a clear error', () => {
    expect(() =>
      finalizeInvokeAgentText('not-json', {
        structuredSchema: { type: 'object' },
      })
    ).toThrow('experimental_subAgent() expected valid JSON output for structured response.');
  });

  it('[Given] prose followed by JSON in structured mode [Then] it recovers the final JSON payload', () => {
    const result = finalizeInvokeAgentText('Reading file now.\n{"ok":true}', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { ok: true },
    });
  });

  it('[Given] fenced JSON in structured mode [Then] it parses the fenced payload', () => {
    const result = finalizeInvokeAgentText('```json\n{"ok":true}\n```', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { ok: true },
    });
  });

  it('[Given] an object containing arrays [Then] it prefers the full object over an inner array', () => {
    const result = finalizeInvokeAgentText('Working...\n{"summary":"done","urgent":["a","b"]}', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { summary: 'done', urgent: ['a', 'b'] },
    });
  });
});

describe('inferCliInvocationPrefix', () => {
  layer(BunContext.layer)(it => {
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
  layer(BunContext.layer)(it => {
    it.effect(
      '[Given] a bundled dist chunk [Then] it resolves sibling companion modules in dist',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-companion-dist-'));
          const callerPath = path.join(tempDir, 'commands-abc.mjs');
          const servicesDir = path.join(tempDir, 'services');
          const companionPath = path.join(servicesDir, 'run-subagent-shared.mjs');
          fs.writeFileSync(callerPath, '', 'utf8');
          fs.mkdirSync(servicesDir);
          fs.writeFileSync(companionPath, '', 'utf8');

          expect(
            yield* resolveRunCompanionModulePath({
              callerImportMetaUrl: pathToFileURL(callerPath).href,
              execPath: '/tmp/composio',
              relativeNoExtensionFromCaller: '../services/run-subagent-shared',
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
          const companionPath = path.join(tempDir, 'run-subagent-shared.mjs');
          fs.writeFileSync(companionPath, '', 'utf8');

          expect(
            yield* resolveRunCompanionModulePath({
              callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
              execPath,
              relativeNoExtensionFromCaller: '../services/run-subagent-shared',
            })
          ).toBe(companionPath);
        })
    );
  });
});

describe('run companion install metadata', () => {
  layer(BunContext.layer)(it => {
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
      '[Given] an install without ACP adapters [Then] the startup tier reports nothing missing',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-no-acp-'));
          const execPath = path.join(tempDir, 'composio');
          for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
            fs.writeFileSync(path.join(tempDir, fileName), '', 'utf8');
          }

          // The ACP adapters are the lazy tier: a plain `composio run` must not
          // treat an install without them as broken.
          const hostStaticAssets = yield* hostRunCompanionStaticAssetRelativePaths;
          expect(hostStaticAssets.length).toBeGreaterThan(0);
          for (const relativePath of hostStaticAssets) {
            expect(fs.existsSync(path.join(tempDir, relativePath))).toBe(false);
          }

          expect(yield* listMissingInstalledRunCompanionModules(execPath)).toEqual([]);
          expect(yield* hasInstalledRunCompanionModules(execPath)).toBe(true);
        })
    );

    it.effect(
      '[Given] a source checkout [Then] the executable has no companion modules next to it',
      () =>
        Effect.gen(function* () {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-no-install-'));

          expect(yield* hasInstalledRunCompanionModules(path.join(tempDir, 'bun'))).toBe(false);
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
            path.join(tempDir, 'run-subagent-shared.mjs'),
            'export * from "./services/run-subagent-shared.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'run-subagent-acp.mjs'),
            'export * from "./services/run-subagent-acp.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'run-subagent-legacy.mjs'),
            'export * from "./services/run-subagent-legacy.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'run-subagent-output-mcp.mjs'),
            'export * from "./services/run-subagent-output-mcp.mjs";\n',
            'utf8'
          );

          fs.writeFileSync(
            path.join(servicesDir, 'run-helpers-runtime.mjs'),
            'export const runtimeValue = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-shared.mjs'),
            'export const x = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-acp.mjs'),
            'export * from "../run-companion-modules-abc123.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-legacy.mjs'),
            'export const y = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-output-mcp.mjs'),
            'export const z = 1;\n',
            'utf8'
          );

          expect(yield* listMissingInstalledRunCompanionModules(execPath)).toContain(
            'run-companion-modules-abc123.mjs'
          );
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
            path.join(tempDir, 'run-subagent-shared.mjs'),
            'export * from "./services/run-subagent-shared.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'run-subagent-acp.mjs'),
            'export * from "./services/run-subagent-acp.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'run-subagent-legacy.mjs'),
            'export * from "./services/run-subagent-legacy.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(tempDir, 'run-subagent-output-mcp.mjs'),
            'export * from "./services/run-subagent-output-mcp.mjs";\n',
            'utf8'
          );

          fs.writeFileSync(
            path.join(servicesDir, 'run-helpers-runtime.mjs'),
            'export const runtimeValue = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-shared.mjs'),
            'export const sharedValue = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-acp.mjs'),
            'export { helperValue } from "../run-companion-modules-def456.mjs";\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-legacy.mjs'),
            'export const legacyValue = 1;\n',
            'utf8'
          );
          fs.writeFileSync(
            path.join(servicesDir, 'run-subagent-output-mcp.mjs'),
            'export const outputValue = 1;\n',
            'utf8'
          );

          expect(yield* listMissingInstalledRunCompanionModules(execPath)).toContain(
            'run-companion-modules-def456.mjs'
          );
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
