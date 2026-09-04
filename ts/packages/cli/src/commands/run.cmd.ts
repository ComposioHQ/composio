import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Command as PlatformCommand, CommandExecutor, FileSystem, Path } from '@effect/platform';
import { Data, Deferred, Duration, Effect, Either, MutableRef, Option } from 'effect';
import { ts } from 'ts-morph';
import { APP_VERSION } from 'src/constants';
import { APP_CONFIG, UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { resolveCommandProject } from 'src/services/command-project';
import { type RunHelperContext } from 'src/services/run-helpers-runtime';
import { warmToolInputDefinitions } from 'src/services/tool-input-validation';
import { ComposioUserContext } from 'src/services/user-context';
import {
  debugFlagsToChildEnv,
  isAcpOnlyEnabled,
  isPerfDebugEnabled,
  isTelemetryDebugEnabled,
  isToolDebugEnabled,
} from 'src/services/runtime-flags';
import { detectMasterFromHost } from 'src/services/master-detector';
import { cliInvocationContext, CliRunId } from 'src/services/runtime-cli-context';
import {
  repairMissingInstalledRunCompanionModules,
  resolveRunCompanionModulePath,
} from 'src/services/run-companion-modules';
import {
  appendCliSessionHistory,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { USER_COMPOSIO_DIR } from 'src/constants';
import { TerminalUI } from 'src/services/terminal-ui';
import { loadHostConfig } from 'src/services/config';
import { resolveCliConfigPath } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';

const file = Options.text('file').pipe(
  Options.withAlias('f'),
  Options.withDescription('Run a TS/JS file instead of inline code'),
  Options.optional
);

const dryRun = Options.boolean('dry-run').pipe(
  Options.withDescription('Preview execute() calls without running them'),
  Options.withDefault(false)
);
const debug = Options.boolean('debug').pipe(
  Options.withDescription('Log helper steps while the script runs'),
  Options.withDefault(false)
);
const logsOff = Options.boolean('logs-off').pipe(
  Options.withDescription('Hide helper streaming logs; keep them only in the run log file.'),
  Options.withDefault(false)
);
const skipConnectionCheck = Options.boolean('skip-connection-check').pipe(
  Options.withDescription('Skip the connected-account check'),
  Options.withDefault(false)
);
const skipToolParamsCheck = Options.boolean('skip-tool-params-check').pipe(
  Options.withDescription('Skip input validation against cached schema'),
  Options.withDefault(false)
);
const skipChecks = Options.boolean('skip-checks').pipe(
  Options.withDescription('Skip both connection and input validation checks'),
  Options.withDefault(false)
);

const args = Args.repeated(Args.text({ name: 'arg' })).pipe(
  Args.withDescription('Inline code followed by arguments, or just arguments when using --file')
);

const withArgDelimiter = (args: ReadonlyArray<string>) => (args.length > 0 ? ['--', ...args] : []);

export const extractInlineExecuteToolSlugs = (source: string): ReadonlyArray<string> => {
  if (!source.trim()) {
    return [];
  }

  const parsed = ts.createSourceFile(
    'composio-run-inline.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const slugs = new Set<string>();

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'execute'
    ) {
      const [slugArg] = node.arguments;
      if (slugArg && ts.isStringLiteralLike(slugArg)) {
        slugs.add(slugArg.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return [...slugs];
};

export const wrapInlineCodeForRun = (source: string): string => {
  const parsed = ts.createSourceFile(
    'composio-run-inline.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const statements = [...parsed.statements];
  if (statements.length === 0) {
    return source;
  }

  const lastStatement = statements.at(-1);
  if (!lastStatement || !ts.isExpressionStatement(lastStatement)) {
    return source;
  }

  const prefix = source.slice(0, lastStatement.getFullStart());
  const suffix = source.slice(lastStatement.getEnd());
  const expressionText = lastStatement.expression.getText(parsed);
  return `${prefix}return (${expressionText});${suffix}`;
};

export const wrapFileSourceForRun = (source: string): string => {
  const parsed = ts.createSourceFile(
    'composio-run-file.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const statements = [...parsed.statements];
  const firstNonImportIndex = statements.findIndex(statement => !ts.isImportDeclaration(statement));
  if (firstNonImportIndex === -1) {
    return source;
  }

  const bodyStart = statements[firstNonImportIndex]!.getFullStart();
  const importPrefix = source.slice(0, bodyStart);
  const body = source.slice(bodyStart);
  return [
    importPrefix,
    'const __composioResult = await (async () => {',
    wrapInlineCodeForRun(body),
    '})();',
    'if (__composioResult !== undefined) {',
    '  console.log(__composioResult);',
    '}',
    '',
  ].join('\n');
};

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
    const readAccessRoots = [
      ...new Set(
        [
          ...(Array.isArray(context.readAccessRoots) ? context.readAccessRoots : []),
          runOutputDir,
        ].map(value => path.resolve(value))
      ),
    ];
    yield* fs.makeDirectory(runOutputDir, { recursive: true });
    yield* fs.writeFileString(runLogFilePath, '');
    yield* fs.writeFileString(
      preloadPath,
      buildRunHelpersSource(
        cliPrefix,
        {
          ...context,
          runOutputDir,
          runLogFilePath,
          readAccessRoots,
        },
        moduleUrls
      )
    );
    return { directory, preloadPath, runOutputDir, runLogFilePath };
  });

/**
 * `composio run` was given neither inline code nor `--file`.
 *
 * An ordinary usage mistake rather than a broken invariant, so it is a typed failure with a
 * one-line message instead of a defect: the caller sees the fix, not a stack trace.
 */
export class MissingRunSourceError extends Data.TaggedError('commands/MissingRunSourceError')<{
  readonly message: string;
}> {}

const MISSING_RUN_SOURCE_MESSAGE = [
  'Provide inline code or use --file to run a script file.',
  `  composio run 'console.log(1)'`,
  '  composio run --file ./script.ts',
].join('\n');

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

    return yield* Effect.fail(new MissingRunSourceError({ message: MISSING_RUN_SOURCE_MESSAGE }));
  });

const resolveRunHelperContext = () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    const orgId = Option.getOrUndefined(userContext.data.orgId);
    const defaultComposioDir = path.join(os.homedir, USER_COMPOSIO_DIR);
    // Honors the same COMPOSIO_CACHE_DIR-then-CACHE_DIR precedence the spawned
    // run-helpers child applies when locating its cache, so the sandbox read
    // roots below always include the directory the child actually uses.
    const composioCacheDir = yield* APP_CONFIG.CACHE_DIR;
    const hostCacheDir = yield* loadHostConfig(UNPREFIXED_CONFIG.CACHE_DIR);
    const configuredCacheDir = composioCacheDir || hostCacheDir || defaultComposioDir;
    const baseReadAccessRoots = [
      ...new Set([defaultComposioDir, configuredCacheDir].map(value => path.resolve(value))),
    ];

    const baseContext = {
      apiKey,
      baseURL: userContext.data.baseURL,
      webURL: userContext.data.webURL,
      orgId,
      cliConfigPath: yield* resolveCliConfigPath,
      readAccessRoots: baseReadAccessRoots,
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
      readAccessRoots: [
        ...new Set(
          [...baseReadAccessRoots, sessionArtifactsDir]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .map(value => path.resolve(value))
        ),
      ],
    } satisfies RunHelperContext;
  });

/**
 * Signals the CLI forwards to the script it runs. Anything else (SIGHUP, SIGQUIT, …) keeps the
 * platform default: the executor's finalizer still tears the child's process group down.
 */
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

type ForwardedSignal = (typeof FORWARDED_SIGNALS)[number];

/**
 * How long the CLI waits for the script to finish its own signal handling before the platform
 * executor's finalizer sends SIGTERM to the process group.
 */
const CHILD_SIGNAL_GRACE_PERIOD = Duration.seconds(2);

class ChildSignalError extends Data.TaggedError('ChildSignalError')<{
  readonly pid: number;
  readonly signal: ForwardedSignal;
  readonly cause: unknown;
}> {}

/**
 * Sends `signal` to the child's process group and reports whether it was delivered.
 *
 * The @effect/platform executor spawns with `detached: true` on POSIX, so the script leads its
 * own process group and a negative pid is what reaches it (and anything it spawned). Delivery
 * fails with ESRCH when the group is already gone, which is a normal race, not a run failure.
 */
const signalChildProcessGroup = (pid: number, signal: ForwardedSignal): boolean =>
  Either.try({
    try: () => process.kill(-pid, signal),
    catch: cause => new ChildSignalError({ pid, signal, cause }),
  }).pipe(Either.getOrElse(() => false));

/**
 * Waits for the script to exit, giving up after `duration`.
 *
 * `Effect.timeout` cannot express this here: the wait runs in a release, while the fiber is
 * already interrupted, and the timer `Effect.timeout` forks as a child of that fiber is
 * interrupted along with it — leaving the wait hanging until the script exits on its own.
 * Daemon fibers are detached from the interrupted fiber, so their deadline still fires.
 */
const awaitChildExitWithin = (child: CommandExecutor.Process, duration: Duration.Duration) =>
  Effect.gen(function* () {
    const settled = yield* Deferred.make<void>();
    const complete = Deferred.succeed(settled, undefined);
    yield* Effect.forkDaemon(Effect.zipRight(Effect.ignore(child.exitCode), complete));
    yield* Effect.forkDaemon(Effect.zipRight(Effect.sleep(duration), complete));
    yield* Deferred.await(settled);
  });

/**
 * Forwards terminal signals to the running script for as long as it is alive.
 *
 * A terminal Ctrl-C only reaches the CLI's process group, so without this the script never
 * observes SIGINT and its `process.on('SIGINT')` cleanup never runs — it is reached later and
 * only as the executor's SIGTERM. Handlers are registered and removed with the scope so they
 * never leak into a later run.
 */
const forwardSignalsToChild = (child: CommandExecutor.Process) =>
  Effect.gen(function* () {
    const os = yield* NodeOs;
    // Windows has no process groups and the executor does not detach there.
    if (os.platform === 'win32') {
      return;
    }

    const pid = Number(child.pid);
    const forwarded = MutableRef.make(false);

    yield* Effect.acquireRelease(
      Effect.sync(() =>
        FORWARDED_SIGNALS.map(signal => {
          const listener = () => {
            if (signalChildProcessGroup(pid, signal)) {
              MutableRef.set(forwarded, true);
            }
          };
          process.on(signal, listener);
          return { signal, listener } as const;
        })
      ),
      listeners =>
        Effect.sync(() => {
          for (const { signal, listener } of listeners) {
            process.removeListener(signal, listener);
          }
        }).pipe(
          Effect.zipRight(
            MutableRef.get(forwarded)
              ? awaitChildExitWithin(child, CHILD_SIGNAL_GRACE_PERIOD)
              : Effect.void
          )
        )
    );
  });

export const runCmd = Command.make('run', {
  file,
  dryRun,
  debug,
  logsOff,
  skipConnectionCheck,
  skipToolParamsCheck,
  skipChecks,
  args,
}).pipe(
  Command.withDescription(
    [
      'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.',
      '',
      'Examples:',
      `  composio run 'const issue = await execute("GITHUB_CREATE_ISSUE", { owner: "composiohq", repo: "composio", title: "Bug report" }); console.log(issue)'`,
      `  composio run --dry-run 'await execute("GMAIL_SEND_EMAIL", { recipient_email: "a@b.com", body: "Hello" })'`,
      `  composio run --debug 'const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER"); console.log(me)'`,
      `  composio run '`,
      `    const [emails, issues] = await Promise.all([`,
      `      execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),`,
      `      execute("GITHUB_LIST_REPOSITORY_ISSUES", { owner: "composiohq", repo: "composio", state: "open" }),`,
      `    ]);`,
      `    const brief = await experimental_subAgent(`,
      `      \`Create a morning brief from these emails and issues.\\n\\n\${emails.prompt()}\\n\\n\${issues.prompt()}\`,`,
      `      {`,
      `        schema: z.object({`,
      `          brief: z.string(),`,
      `          urgentEmails: z.array(z.string()),`,
      `          urgentIssues: z.array(z.string()),`,
      `        }),`,
      `      }`,
      `    );`,
      `    brief.structuredOutput;`,
      `  '`,
      '  composio run --file ./script.ts -- hello world',
      '',
      'Injected helpers (behave like their CLI counterparts):',
      '  execute(slug, data?)          Same as `composio execute` — returns parsed JSON',
      '  search(query, options?)        Same as `composio search` — returns matching tools',
      '  experimental_subAgent(prompt, options?) Experimental helper to spawn a powerful sub-agent from the same agent family as your current main agent',
      '                                 (Codex -> Codex, Claude -> Claude) with optional Zod structured output',
      '  result.prompt()                Prompt-safe serialization of a helper result, ideal for experimental_subAgent(...)',
      '  const f = await proxy(toolkit) Same as `composio proxy` — returns a fetch function',
      '                                 Example: const f = await proxy("gmail")',
      '                                          const me = await f("https://gmail.googleapis.com/gmail/v1/users/me/profile")',
      '  z                              Injected global from `zod` for structured output schemas',
      '',
      'All helpers reuse your CLI auth state and connected accounts.',
      '',
      'Flags:',
      '  --debug                     Log helper steps while the script runs',
      '  --dry-run                   Preview execute() calls without running them',
      '  --logs-off                  Hide the always-on experimental_subAgent streaming logs',
      '  --skip-connection-check     Skip the connected-account check',
      '  --skip-tool-params-check    Skip input validation against cached schema',
      '  --skip-checks               Skip both checks above',
      '',
      'See also:',
      '  composio search "<query>"                 Discover tool slugs before scripting',
      '  composio link <toolkit>                   Connect accounts before scripting',
      '  composio execute <slug> --get-schema      Inspect tool inputs before scripting',
    ].join('\n')
  ),
  Command.withHandler(
    ({
      file,
      dryRun,
      debug,
      logsOff,
      skipConnectionCheck,
      skipToolParamsCheck,
      skipChecks,
      args,
    }) =>
      Effect.gen(function* () {
        // Checked before any setup work so a bare `composio run` neither creates a run-artifacts
        // directory nor advertises a log file for a script that will never start.
        if (Option.isNone(file) && !args[0]) {
          return yield* Effect.fail(
            new MissingRunSourceError({ message: MISSING_RUN_SOURCE_MESSAGE })
          );
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
        const acpOnly = yield* isAcpOnlyEnabled;
        const telemetryDebug = yield* isTelemetryDebugEnabled;
        if (Option.isNone(file)) {
          const [inlineCode] = args;
          const preloadSlugs = extractInlineExecuteToolSlugs(inlineCode ?? '');
          if (preloadSlugs.length > 0) {
            yield* warmToolInputDefinitions(preloadSlugs).pipe(
              Effect.catchAll(() => Effect.void),
              Effect.forkDaemon
            );
          }
        }

        const helperContext: RunHelperContext = {
          ...(yield* resolveRunHelperContext()),
          runId,
          master: yield* detectMasterFromHost,
          perfDebug,
          toolDebug,
          telemetryDebug,
          debug,
          logsOff,
          acpOnly,
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
        }).pipe(Effect.catchAll(() => Effect.void));
        yield* ui.error(`RUN_LOG_FILE=${preload.runLogFilePath}`);
        const runCommand = yield* buildRunCommand({
          path,
          file,
          args,
          preloadPath: preload.preloadPath,
          preloadDirectory: preload.directory,
        });
        const exitCode = yield* Effect.gen(function* () {
          const [executable, ...commandArgs] = runCommand.cmd;
          const command = PlatformCommand.make(executable, ...commandArgs).pipe(
            PlatformCommand.env({
              BUN_BE_BUN: '1',
              COMPOSIO_CLI_PARENT_RUN_ID: runId,
              ...debugFlagsToChildEnv({ perfDebug, toolDebug, acpOnly, telemetryDebug }),
            }),
            PlatformCommand.stdin('inherit'),
            PlatformCommand.stdout('inherit'),
            PlatformCommand.stderr('inherit')
          );
          // Start the process instead of running it to completion: only a started process
          // exposes the pid the signal forwarding below needs.
          const child = yield* PlatformCommand.start(command);
          yield* forwardSignalsToChild(child);
          return Number(yield* child.exitCode);
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
          ),
          // Interruption (Ctrl-C) skips the assignment below, and the default teardown reports
          // an interrupt-only exit as success. Report the conventional 128+SIGINT instead so
          // wrappers and `set -e` scripts do not read a cancelled run as a passing one.
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              process.exitCode = 130;
            })
          )
        );
        process.exitCode = exitCode;
      }).pipe(Effect.scoped)
  )
);
