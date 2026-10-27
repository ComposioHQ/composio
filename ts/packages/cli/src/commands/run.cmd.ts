import { CommandInputError } from 'src/commands/errors';
import process from 'node:process';
import { Argument, Command, Flag } from 'effect/cli';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { Data, Duration, Effect, Option, Result } from 'effect';
import { APP_VERSION } from 'src/constants';
import { ChildProcessExited, ChildProcessSignaled } from 'src/effects/child-process-exited';
import { childExitStatus } from 'src/effects/child-exit-status';
import {
  STOP_SIGNALS,
  ShutdownSignal,
  type ShutdownSignalShape,
  type TerminationSignal,
} from 'src/services/shutdown-signal';
import { loadGenerationRuntime } from 'src/effects/generation-runtime';
import { resolveCommandProject } from 'src/services/command-project';
import { type RunHelperContext } from 'src/services/run-helpers-runtime';
import { warmToolInputDefinitions } from 'src/services/tool-input-validation';
import { ComposioUserContext } from 'src/services/user-context';
import { resolveConsumerExecutionTransport } from 'src/services/dashboard-tool-execution';
import {
  CLI_DEBUG_FLAG_NAMES,
  debugFlagsToChildEnv,
  isPerfDebugEnabled,
  isTelemetryDebugEnabled,
  isToolDebugEnabled,
} from 'src/services/runtime-flags';
import { cliInvocationContext, CliRunId } from 'src/services/runtime-cli-context';
import {
  repairMissingInstalledRunCompanionModules,
  resolveRunCompanionModulePath,
} from 'src/services/run-companion-modules';
import {
  appendCliSessionHistory,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { TerminalUI } from 'src/services/terminal-ui';
import { NodeOs } from 'src/services/node-os';

const RUN_FLAG_NAMES = {
  file: 'file',
  dryRun: 'dry-run',
  debug: 'debug',
  skipConnectionCheck: 'skip-connection-check',
  skipToolParamsCheck: 'skip-tool-params-check',
  skipChecks: 'skip-checks',
} as const;

const file = Flag.String(RUN_FLAG_NAMES.file).pipe(
  Flag.withAlias('f'),
  Flag.withDescription('Run a TS/JS file instead of inline code'),
  Flag.optional
);

const dryRun = Flag.Boolean(RUN_FLAG_NAMES.dryRun).pipe(
  Flag.withDescription('Preview execute() calls without running them'),
  Flag.withDefault(false)
);
const debug = Flag.Boolean(RUN_FLAG_NAMES.debug).pipe(
  Flag.withDescription('Log helper steps while the script runs'),
  Flag.withDefault(false)
);
const skipConnectionCheck = Flag.Boolean(RUN_FLAG_NAMES.skipConnectionCheck).pipe(
  Flag.withDescription('Skip the connected-account check'),
  Flag.withDefault(false)
);
const skipToolParamsCheck = Flag.Boolean(RUN_FLAG_NAMES.skipToolParamsCheck).pipe(
  Flag.withDescription('Skip input validation against cached schema'),
  Flag.withDefault(false)
);
const skipChecks = Flag.Boolean(RUN_FLAG_NAMES.skipChecks).pipe(
  Flag.withDescription('Skip both connection and input validation checks'),
  Flag.withDefault(false)
);

const runFlags = {
  file,
  dryRun,
  debug,
  skipConnectionCheck,
  skipToolParamsCheck,
  skipChecks,
};

/** Share names with the passthrough adapter; the framework owns parsing the flag values. */
export const RUN_FILE_FLAGS = new Set([`--${RUN_FLAG_NAMES.file}`, '-f']);
export const RUN_KNOWN_VALUE_FLAGS = new Set([...RUN_FILE_FLAGS, '--log-level']);
export const RUN_KNOWN_BOOLEAN_FLAGS = new Set([
  ...Object.values(RUN_FLAG_NAMES)
    .filter(name => name !== RUN_FLAG_NAMES.file)
    .map(name => `--${name}`),
  ...CLI_DEBUG_FLAG_NAMES.flatMap(name => [`--${name}`, `--no-${name}`]),
  '--help',
  '-h',
  '--version',
  '-v',
]);

const args = Argument.String('arg').pipe(
  Argument.variadic(),
  Argument.withDescription('Inline code followed by arguments, or just arguments when using --file')
);

const withArgDelimiter = (args: ReadonlyArray<string>) => (args.length > 0 ? ['--', ...args] : []);

/**
 * The source rewrites need the TypeScript compiler, which ships in the
 * `generation-runtime` companion module next to the executable rather than in
 * the executable itself. Loading it here keeps it off every other command's
 * startup path. A missing companion goes through the same self-repair as the
 * `run-*` modules, and its error surfaces exactly as theirs does below.
 */
const loadSourceTransforms = loadGenerationRuntime.pipe(
  Effect.mapError(error => new Error(error.message))
);

export const inferCliInvocationPrefix = (
  path: Path.Path,
  argv: ReadonlyArray<string> = process.argv
) =>
  Effect.gen(function* () {
    const entrypoint = argv[1];
    if (!entrypoint) {
      return [process.execPath];
    }

    // Compiled Bun binaries report an internal $bunfs entrypoint which cannot be
    // re-executed as a real filesystem path. In that case the binary itself is
    // the CLI entrypoint.
    if (entrypoint.startsWith('/$bunfs/')) {
      return [process.execPath];
    }

    const fs = yield* FileSystem.FileSystem;
    const resolvedEntrypoint = path.resolve(entrypoint);
    return (yield* fs.exists(resolvedEntrypoint))
      ? [process.execPath, resolvedEntrypoint]
      : [process.execPath];
  });

type RunHelperModuleUrls = {
  readonly helpersRuntimeModuleUrl: string;
};

const resolveRunHelperModuleUrls: Effect.Effect<
  RunHelperModuleUrls,
  never,
  FileSystem.FileSystem | Path.Path
> = Effect.gen(function* () {
  const path = yield* Path.Path;
  const modulePath = yield* resolveRunCompanionModulePath({
    callerImportMetaUrl: import.meta.url,
    execPath: process.execPath,
    relativeNoExtensionFromCaller: '../services/run-helpers-runtime',
  });
  const moduleUrl = yield* Effect.orDie(path.toFileUrl(modulePath));
  return { helpersRuntimeModuleUrl: moduleUrl.href };
});
export const buildRunHelpersSource = (
  cliPrefix: ReadonlyArray<string>,
  context: RunHelperContext = {},
  moduleUrls: RunHelperModuleUrls
): string =>
  [
    `import { installRunHelpers } from ${JSON.stringify(moduleUrls.helpersRuntimeModuleUrl)};`,
    '',
    `await installRunHelpers(${JSON.stringify({ cliPrefix, helperContext: context })});`,
  ].join('\n');

const createRunHelpersPreloadFile = (
  path: Path.Path,
  cliPrefix: ReadonlyArray<string>,
  context: RunHelperContext,
  moduleUrls: RunHelperModuleUrls
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const os = yield* NodeOs;
    const directory = yield* fs.makeTempDirectoryScoped({
      directory: os.tmpdir,
      prefix: 'composio-run-',
    });
    const preloadPath = path.join(directory, 'globals.mjs');
    // The preload directory is scoped and removed when the run ends, but the run log and any
    // large tool outputs are advertised to the caller on stderr (`RUN_LOG_FILE=`) and must
    // outlive the process that printed them, so they get their own unscoped directory.
    const runOutputDir =
      typeof context.runOutputDir === 'string' && context.runOutputDir.length > 0
        ? context.runOutputDir
        : yield* fs.makeTempDirectory({ directory: os.tmpdir, prefix: 'composio-run-artifacts-' });
    const runLogFilePath = path.join(runOutputDir, 'run.log');
    yield* fs.makeDirectory(runOutputDir, { recursive: true });
    yield* fs.writeFileString(runLogFilePath, '');
    yield* fs.writeFileString(
      preloadPath,
      buildRunHelpersSource(cliPrefix, { ...context, runOutputDir, runLogFilePath }, moduleUrls)
    );
    return { directory, preloadPath, runOutputDir, runLogFilePath };
  });

/**
 * `composio run` was given neither inline code nor `--file`.
 *
 * An ordinary usage mistake rather than a broken invariant, so it is a typed failure with a
 * one-line message instead of a defect: the caller sees the fix, not a stack trace.
 */
const MISSING_RUN_SOURCE_MESSAGE = [
  'Provide inline code or use --file to run a script file.',
  `  composio run 'console.log(1)'`,
  '  composio run --file ./script.ts',
].join('\n');

const missingRunSource = () =>
  new CommandInputError({ command: 'run', message: MISSING_RUN_SOURCE_MESSAGE });

export const buildRunCommand = ({
  path,
  file,
  args,
  preloadPath,
  preloadDirectory,
}: {
  path: Path.Path;
  file: Option.Option<string>;
  args: ReadonlyArray<string>;
  preloadPath: string;
  preloadDirectory: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { wrapFileSourceForRun, wrapInlineCodeForRun } = yield* loadSourceTransforms;
    // Use process.execPath directly — the child is spawned with BUN_BE_BUN=1
    // which makes compiled Bun binaries act as a plain Bun runtime.
    // Avoid the `run` subcommand entirely since Bun intercepts it as its own
    // built-in; `bun --preload <file> <script>` works without it.
    const base = [process.execPath, '--preload', preloadPath];
    if (Option.isSome(file)) {
      const filePath = path.resolve(file.value);
      const wrapperFilePath = path.join(
        path.dirname(filePath),
        `.composio-run-${path.basename(preloadDirectory)}${path.extname(filePath) || '.ts'}`
      );
      yield* fs.writeFileString(
        wrapperFilePath,
        wrapFileSourceForRun(yield* fs.readFileString(filePath, 'utf8'))
      );
      return {
        cmd: [...base, wrapperFilePath, ...withArgDelimiter(args)],
        cleanupPaths: [wrapperFilePath],
      };
    }

    const [inlineCode, ...scriptArgs] = args;
    if (inlineCode) {
      const wrappedInlineCode = [
        '(async () => {',
        wrapInlineCodeForRun(inlineCode),
        '})().then((__composioResult) => {',
        '  if (__composioResult !== undefined) {',
        '    console.log(__composioResult);',
        '  }',
        '});',
      ].join('\n');
      return {
        cmd: [...base, '--eval', wrappedInlineCode, ...withArgDelimiter(scriptArgs)],
        cleanupPaths: [],
      };
    }

    return yield* Effect.fail(missingRunSource());
  });

const resolveRunHelperContext = () =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    const orgId = Option.getOrUndefined(userContext.data.orgId);
    // A spawned `composio execute` treats a forwarded web URL as an explicit
    // choice of Dashboard. When this process keeps the backend transport (a
    // custom backend with no web URL), forward none so the child decides alike.
    const forwardWebURL = (yield* resolveConsumerExecutionTransport) === 'dashboard';
    const baseContext = {
      apiKey,
      baseURL: userContext.data.baseURL,
      ...(forwardWebURL ? { webURL: userContext.data.webURL } : {}),
      orgId,
    } satisfies RunHelperContext;

    if (!apiKey || !orgId) {
      return baseContext;
    }

    const consumerProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(Effect.option);
    if (Option.isNone(consumerProject) || consumerProject.value.projectType !== 'CONSUMER') {
      return baseContext;
    }

    const sessionArtifactsDir = Option.getOrUndefined(
      yield* resolveCliSessionArtifacts({
        orgId,
        consumerUserId: consumerProject.value.consumerUserId,
      }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
    );

    return {
      ...baseContext,
      consumerUserId: consumerProject.value.consumerUserId,
      consumerProjectId: consumerProject.value.projectId,
      consumerProjectName: consumerProject.value.projectName,
      runOutputDir: sessionArtifactsDir,
    } satisfies RunHelperContext;
  });

/**
 * How long the script gets to handle a forwarded signal before the CLI sends it SIGTERM, and
 * again before SIGKILL.
 */
const CHILD_SIGNAL_GRACE_PERIOD = Duration.seconds(2);

class ChildSignalError extends Data.TaggedError('ChildSignalError')<{
  readonly pid: number;
  readonly signal: TerminationSignal;
  readonly cause: unknown;
}> {}

/**
 * Sends `signal` to the child's process group.
 *
 * The `effect/process` spawner spawns with `detached: true` on POSIX, so the script leads its
 * own process group and a negative pid is what reaches it (and anything it spawned). Delivery
 * fails with ESRCH when the group is already gone, which is a normal race, not a run failure.
 */
const signalChildProcessGroup = (pid: number, signal: TerminationSignal): void => {
  Result.try({
    try: () => process.kill(-pid, signal),
    catch: cause => new ChildSignalError({ pid, signal, cause }),
  });
};

/**
 * Hands the CLI's first signal to the script, then makes sure the script ends: SIGTERM after a
 * grace period, SIGKILL after another. The script decides how the run ends, as it would under a
 * shell: one that handles SIGINT and exits 0 makes the run succeed.
 */
const relayStopToChild = (
  child: ChildProcessSpawner.ChildProcessHandle,
  pid: number,
  shutdown: ShutdownSignalShape
) =>
  Effect.gen(function* () {
    const signal = yield* shutdown.requested;
    signalChildProcessGroup(pid, signal);
    const escalation: ReadonlyArray<TerminationSignal> =
      signal === 'SIGTERM' ? ['SIGKILL'] : ['SIGTERM', 'SIGKILL'];
    yield* Effect.forEach(
      escalation,
      next =>
        Effect.sleep(CHILD_SIGNAL_GRACE_PERIOD).pipe(
          Effect.andThen(child.isRunning),
          Effect.flatMap(running =>
            running ? Effect.sync(() => signalChildProcessGroup(pid, next)) : Effect.void
          )
        ),
      { discard: true }
    );
  });

/**
 * Waits for the script and reports how it ended, relaying the CLI's signals to it meanwhile.
 *
 * A terminal Ctrl-C only reaches the CLI's process group, so without this the script never
 * observes SIGINT and its `process.on('SIGINT')` cleanup never runs. The run cooperates on every
 * signal the runner handles (`ShutdownSignal`): the CLI is not interrupted, it forwards the
 * signal and mirrors the script's exit. A second signal kills the script's process group and
 * re-raises that signal.
 */
const superviseChild = (child: ChildProcessSpawner.ChildProcessHandle) =>
  Effect.gen(function* () {
    const os = yield* NodeOs;
    // Windows has no process groups and the executor does not detach there: a signal interrupts
    // the run, and the spawner's finalizer ends the script.
    if (os.platform === 'win32') {
      return yield* childExitStatus(child);
    }

    const shutdown = yield* ShutdownSignal;
    const pid = Number(child.pid);
    yield* shutdown.cooperate({
      signals: STOP_SIGNALS,
      onForce: () => signalChildProcessGroup(pid, 'SIGKILL'),
      reraiseOnForce: true,
    });
    yield* Effect.forkScoped(relayStopToChild(child, pid, shutdown));
    return yield* childExitStatus(child);
  });

export const runCmd = Command.make('run', {
  ...runFlags,
  args,
}).pipe(
  Command.withDescription(
    'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.\n\nInjected helpers (behave like their CLI counterparts):\n  execute(slug, data?)          Same as `composio execute` — returns parsed JSON\n  search(query, options?)        Same as `composio search` — returns matching tools\n  result.prompt()                Prompt-safe serialization of a helper result\n  const f = await proxy(toolkit) Same as `composio proxy` — returns a fetch function\n                                 Example: const f = await proxy("gmail")\n                                          const me = await f("https://gmail.googleapis.com/gmail/v1/users/me/profile")\n  z                              Injected global from `zod` for defining and validating schemas\n\nAll helpers reuse your CLI auth state and connected accounts.\n\nUse composio search "<query>" to discover tools and composio execute <slug> --get-schema to inspect inputs.'
  ),
  Command.withShortDescription(
    'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.'
  ),
  Command.withExamples([
    {
      command:
        'composio run \'\n  // execute(slug, data?) — run a tool, returns parsed JSON\n  const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER");\n  console.log(me);\n\'',
    },
    {
      command:
        'composio run \'\n  // search(query, opts?) — find tools by use case\n  const tools = await search("send email");\n  console.log(tools);\n\'',
    },
    {
      command:
        'composio run \'\n  const issue = await execute("GITHUB_CREATE_ISSUE", { owner: "acme", repo: "app", title: "Deploy v2" });\n  await execute("SLACK_SEND_MESSAGE", { channel: "eng", markdown_text: "Created: " + issue.data.html_url });\n\'',
      description: 'Sequential: chain tool outputs across services',
    },
    {
      command:
        'composio run \'\n  const [emails, issues, events] = await Promise.all([\n    execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),\n    execute("GITHUB_LIST_REPOSITORY_ISSUES", { owner: "composiohq", repo: "composio", state: "open" }),\n    execute("GOOGLECALENDAR_FIND_EVENT", { calendar_id: "primary" }),\n  ]);\n  console.log({ emails: emails.data, issues: issues.data, events: events.data });\n\'',
      description: 'Parallel: fetch from multiple services at once with Promise.all',
    },
    {
      command:
        'composio run \'\n  const issues = [101, 102, 103, 104];\n  await Promise.all(issues.map(n =>\n    execute("GITHUB_ADD_LABELS_TO_ISSUE", { owner: "acme", repo: "app", issue_number: n, labels: ["priority"] })\n  ));\n\'',
      description: 'Bulk: fan out with Promise.all + .map()',
    },
    {
      command:
        'composio run \'\n  const f = await proxy("gmail");\n  console.log(await f("https://gmail.googleapis.com/gmail/v1/users/me/profile"));\n\'',
      description: 'proxy(toolkit) — returns a fetch() bound to your connected account',
    },
    {
      command: 'composio run --file ./workflow.ts -- --repo acme/app',
      description: 'Run from a file',
    },
  ]),
  Command.withHandler(
    ({ file, dryRun, debug, skipConnectionCheck, skipToolParamsCheck, skipChecks, args }) =>
      Effect.gen(function* () {
        // Checked before any setup work so a bare `composio run` neither creates a run-artifacts
        // directory nor advertises a log file for a script that will never start.
        if (Option.isNone(file) && !args[0]) {
          return yield* Effect.fail(missingRunSource());
        }

        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const invocation = yield* cliInvocationContext;
        const runId = Option.getOrElse(
          yield* CliRunId,
          () => invocation.parentRunId ?? crypto.randomUUID()
        );
        const perfDebug = yield* isPerfDebugEnabled;
        const toolDebug = yield* isToolDebugEnabled;
        const telemetryDebug = yield* isTelemetryDebugEnabled;
        if (Option.isNone(file)) {
          const [inlineCode] = args;
          const { extractInlineExecuteToolSlugs } = yield* loadSourceTransforms;
          const preloadSlugs = extractInlineExecuteToolSlugs(inlineCode ?? '');
          if (preloadSlugs.length > 0) {
            yield* warmToolInputDefinitions(preloadSlugs).pipe(
              Effect.catch(() => Effect.void),
              Effect.forkDetach
            );
          }
        }

        const helperContext: RunHelperContext = {
          ...(yield* resolveRunHelperContext()),
          runId,
          perfDebug,
          toolDebug,
          telemetryDebug,
          debug,
          dryRun,
          skipConnectionCheck,
          skipToolParamsCheck,
          skipChecks,
        };
        const runHelperModuleUrls = yield* repairMissingInstalledRunCompanionModules({
          callerImportMetaUrl: import.meta.url,
          execPath: process.execPath,
          appVersion: APP_VERSION,
        }).pipe(
          Effect.mapError(error => new Error(error.message)),
          Effect.andThen(resolveRunHelperModuleUrls)
        );
        const cliPrefix = yield* inferCliInvocationPrefix(path);
        const preload = yield* createRunHelpersPreloadFile(
          path,
          cliPrefix,
          helperContext,
          runHelperModuleUrls
        );
        const ui = yield* TerminalUI;
        yield* appendCliSessionHistory({
          orgId: helperContext.orgId,
          consumerUserId: helperContext.consumerUserId,
          entry: {
            command: 'run',
            status: 'start',
            file: Option.getOrUndefined(file),
            args,
            debug,
          },
        }).pipe(Effect.catch(() => Effect.void));
        yield* ui.error(`RUN_LOG_FILE=${preload.runLogFilePath}`);
        const runCommand = yield* buildRunCommand({
          path,
          file,
          args,
          preloadPath: preload.preloadPath,
          preloadDirectory: preload.directory,
        });
        const status = yield* Effect.gen(function* () {
          const [executable, ...commandArgs] = runCommand.cmd;
          // Spawning the command (instead of running it to completion) yields the handle whose
          // pid the signal forwarding below needs. `extendEnv` keeps the caller's environment.
          const child = yield* ChildProcess.make(executable!, commandArgs, {
            env: {
              BUN_BE_BUN: '1',
              COMPOSIO_CLI_PARENT_RUN_ID: runId,
              ...debugFlagsToChildEnv({ perfDebug, toolDebug, telemetryDebug }),
            },
            extendEnv: true,
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit',
          });
          return yield* superviseChild(child);
        }).pipe(
          Effect.scoped,
          Effect.ensuring(
            Effect.forEach(
              runCommand.cleanupPaths,
              cleanupPath => fs.remove(cleanupPath, { force: true }),
              { discard: true }
            ).pipe(
              // The wrapper file sits next to the user's script, so removal can fail on a
              // read-only or locked directory. That must not turn an already-successful run
              // into a failure, which is what the previous `Effect.orDie` did.
              Effect.ignore
            )
          )
        );
        // The process ends the way the script did: with its code, or, when a signal ended it,
        // by the same signal (the runner re-raises it), so wrappers and `set -e` scripts read a
        // cancelled run as cancelled.
        if (status.signal !== null) {
          return yield* new ChildProcessSignaled({ signal: status.signal });
        }
        if (status.code !== 0) {
          return yield* new ChildProcessExited({ code: status.code });
        }
      }).pipe(Effect.scoped)
  )
);
