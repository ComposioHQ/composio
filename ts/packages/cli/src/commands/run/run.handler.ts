import { CommandInputError } from 'src/commands/errors';
import process from 'node:process';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Effect, Option } from 'effect';
import { ChildProcessExited } from 'src/effects/child-process-exited';
import { actingUser } from 'src/commands/surface';
import type { RunHelperContext } from 'src/services/run-helpers-runtime';
import { agentSessionHeaders, resolveAgentSession } from 'src/services/agent-session';
import { warmToolInputDefinitions } from 'src/services/tool-input-validation';
import { ComposioUserContext } from 'src/services/user-context';
import { resolveConsumerExecutionTransport } from 'src/services/dashboard-tool-execution';
import {
  debugFlagsToChildEnv,
  isPerfDebugEnabled,
  isTelemetryDebugEnabled,
  isToolDebugEnabled,
} from 'src/services/runtime-flags';
import { cliInvocationContext } from 'src/services/runtime-cli-context';
import { invocationRunId } from 'src/invocation/command-identity';
import { isBunVirtualPath } from 'src/services/run-companion-modules';
import {
  appendCliSessionHistory,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { TerminalUI } from 'src/services/terminal-ui';
import { NodeOs } from 'src/services/node-os';

// The confined runtime (the interpreter, its helpers, `z`) and the source rewrites (acorn and
// sucrase) are bundled into the executable but evaluated only when a script runs, so no other
// command pays for them at startup.

/** The confined runtime that runs a script, with this run's helpers. */
const loadRunHelpersRuntime = Effect.promise(() => import('../../services/run-helpers-runtime'));

/** The source rewrites: TypeScript stripping, import hoisting, the trailing expression. */
const loadSourceTransforms = Effect.promise(() => import('../run-source-transforms'));

export const inferCliInvocationPrefix = (
  path: Path.Path,
  argv: ReadonlyArray<string> = process.argv
) =>
  Effect.gen(function* () {
    const entrypoint = argv[1];
    if (!entrypoint) {
      return [process.execPath];
    }

    // Helpers invoke CLI commands through the compiled executable when argv names a $bunfs entrypoint.
    if (isBunVirtualPath(entrypoint)) {
      return [process.execPath];
    }

    const fs = yield* FileSystem.FileSystem;
    const resolvedEntrypoint = path.resolve(entrypoint);
    return (yield* fs.exists(resolvedEntrypoint))
      ? [process.execPath, resolvedEntrypoint]
      : [process.execPath];
  });

/**
 * Creates the run log, which is advertised to the caller on stderr (`RUN_LOG_FILE=`) and must
 * outlive the run that printed it, as must any large tool output stored beside it.
 */
const createRunArtifacts = (path: Path.Path, context: RunHelperContext) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const os = yield* NodeOs;
    const runOutputDir =
      typeof context.runOutputDir === 'string' && context.runOutputDir.length > 0
        ? context.runOutputDir
        : yield* fs.makeTempDirectory({ directory: os.tmpdir, prefix: 'composio-run-artifacts-' });
    const runLogFilePath = path.join(runOutputDir, 'run.log');
    yield* fs.makeDirectory(runOutputDir, { recursive: true });
    yield* fs.writeFileString(runLogFilePath, '');
    return { runOutputDir, runLogFilePath };
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

/** The script a run executes: its source, how errors name it, and its `process.argv`. */
export const readRunScript = ({
  path,
  file,
  args,
}: {
  path: Path.Path;
  file: Option.Option<string>;
  args: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    if (Option.isSome(file)) {
      const fs = yield* FileSystem.FileSystem;
      const filePath = path.resolve(file.value);
      const source = yield* fs.readFileString(filePath, 'utf8').pipe(
        Effect.mapError(
          error =>
            new CommandInputError({
              command: 'run',
              message: `Cannot read the script file ${filePath}: ${error.message}`,
            })
        )
      );
      return {
        source,
        fileName: filePath,
        displayName: filePath,
        argv: [process.execPath, filePath, ...args],
      };
    }

    const [inlineCode, ...scriptArgs] = args;
    if (!inlineCode) {
      return yield* Effect.fail(missingRunSource());
    }
    return {
      source: inlineCode,
      fileName: 'composio-run.ts',
      displayName: '[eval]',
      // As `bun --eval` gave it: the runtime, then the script's own arguments.
      argv: [process.execPath, ...scriptArgs],
    };
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
    // The helper runtime reads no environment variable, so the agent session its `proxy()`
    // requests carry is resolved here; none while telemetry is disabled.
    const agentSession = yield* resolveAgentSession;
    const baseContext = {
      apiKey,
      baseURL: userContext.data.baseURL,
      ...(forwardWebURL ? { webURL: userContext.data.webURL } : {}),
      orgId,
      ...Option.match(agentSession, {
        onNone: () => ({}),
        onSome: session => ({ agentSessionHeaders: agentSessionHeaders(session) }),
      }),
    } satisfies RunHelperContext;

    if (!apiKey || !orgId) {
      return baseContext;
    }

    // Without a consumer user the script runs with the base context alone.
    const consumer = yield* actingUser().pipe(Effect.option);
    if (Option.isNone(consumer)) {
      return baseContext;
    }
    const { userId: consumerUserId, project: consumerProject } = consumer.value;

    const sessionArtifactsDir = Option.getOrUndefined(
      yield* resolveCliSessionArtifacts({
        orgId,
        consumerUserId,
      }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
    );

    return {
      ...baseContext,
      consumerUserId,
      consumerProjectId: consumerProject.projectId,
      consumerProjectName: consumerProject.projectName,
      runOutputDir: sessionArtifactsDir,
    } satisfies RunHelperContext;
  });

/** The flags and arguments of `composio run`. */
export type RunParams = {
  readonly file: Option.Option<string>;
  readonly dryRun: boolean;
  readonly debug: boolean;
  readonly skipConnectionCheck: boolean;
  readonly skipToolParamsCheck: boolean;
  readonly skipChecks: boolean;
  readonly args: ReadonlyArray<string>;
};

/**
 * Runs inline code or a script file in the confined runtime with the Composio helpers injected,
 * and ends the way the script did.
 */
export const runScript = ({
  file,
  dryRun,
  debug,
  skipConnectionCheck,
  skipToolParamsCheck,
  skipChecks,
  args,
}: RunParams) =>
  Effect.gen(function* () {
    // Checked before any setup work so a bare `composio run` neither creates a run-artifacts
    // directory nor advertises a log file for a script that will never start.
    if (Option.isNone(file) && !args[0]) {
      return yield* Effect.fail(missingRunSource());
    }

    const path = yield* Path.Path;
    const invocation = yield* cliInvocationContext;
    const runId = Option.getOrElse(
      yield* invocationRunId,
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
    const cliPrefix = yield* inferCliInvocationPrefix(path);
    const artifacts = yield* createRunArtifacts(path, helperContext);
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
    yield* ui.error(`RUN_LOG_FILE=${artifacts.runLogFilePath}`);

    const script = yield* readRunScript({ path, file, args });
    const { prepareRunProgram } = yield* loadSourceTransforms;
    const program = prepareRunProgram(script.source, script.fileName);
    const { runScriptWithHelpers } = yield* loadRunHelpersRuntime;
    // The script runs in this process. Interrupting the run (a signal) aborts it and every helper
    // call it has in flight, and the runner exits 128 + the signal's number.
    const outcome = yield* Effect.promise(signal =>
      runScriptWithHelpers({
        program,
        source: script.source,
        displayName: script.displayName,
        argv: script.argv,
        envOverrides: {
          COMPOSIO_CLI_PARENT_RUN_ID: runId,
          ...debugFlagsToChildEnv({ perfDebug, toolDebug, telemetryDebug }),
        },
        cwd: path.resolve('.'),
        cliPrefix,
        helperContext: { ...helperContext, ...artifacts },
        signal,
      })
    );
    // The process ends the way the script did: with the code it exited with.
    if (outcome.exitCode !== 0) {
      return yield* new ChildProcessExited({ code: outcome.exitCode });
    }
  }).pipe(Effect.scoped);
