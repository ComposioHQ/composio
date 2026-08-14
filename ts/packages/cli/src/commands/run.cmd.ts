import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Command as PlatformCommand, FileSystem, Path } from '@effect/platform';
import { Effect, Option } from 'effect';
import { ts } from 'ts-morph';
import { APP_VERSION } from 'src/constants';
import { APP_CONFIG } from 'src/effects/app-config';
import { resolveCommandProject } from 'src/services/command-project';
import { type RunHelperContext } from 'src/services/run-helpers-runtime';
import { warmToolInputDefinitions } from 'src/services/tool-input-validation';
import { ComposioUserContext } from 'src/services/user-context';
import {
  isAcpOnlyEnabled,
  isPerfDebugEnabled,
  isToolDebugEnabled,
} from 'src/services/runtime-flags';
import { detectMasterFromHost } from 'src/services/master-detector';
import { getRuntimeCliInvocationContext } from 'src/services/runtime-cli-context';
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
import { readUnprefixedOptionalEnv } from 'src/services/config';
import { resolveCliConfigPath } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import { CommandRunner } from 'src/services/command-runner';

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
    const runOutputDir =
      typeof context.runOutputDir === 'string' && context.runOutputDir.length > 0
        ? context.runOutputDir
        : path.join(directory, 'artifacts');
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

    return yield* Effect.dieMessage('Provide inline code or use --file to run a script file.');
  });

const resolveRunHelperContext = () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    const orgId = Option.getOrUndefined(userContext.data.orgId);
    const defaultComposioDir = path.join(os.homedir, USER_COMPOSIO_DIR);
    const composioCacheDir = yield* APP_CONFIG.CACHE_DIR;
    const cacheDir = (yield* readUnprefixedOptionalEnv('CACHE_DIR'))?.trim();
    const configuredCacheDir = composioCacheDir || cacheDir || defaultComposioDir;
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

    return {
      ...baseContext,
      consumerUserId: consumerProject.value.consumerUserId,
      consumerProjectId: consumerProject.value.projectId,
      consumerProjectName: consumerProject.value.projectName,
      runOutputDir: Option.getOrUndefined(
        yield* resolveCliSessionArtifacts({
          orgId,
          consumerUserId: consumerProject.value.consumerUserId,
        }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
      ),
      readAccessRoots: [
        ...new Set(
          [
            ...baseReadAccessRoots,
            Option.getOrUndefined(
              yield* resolveCliSessionArtifacts({
                orgId,
                consumerUserId: consumerProject.value.consumerUserId,
              }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
            ),
          ]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .map(value => path.resolve(value))
        ),
      ],
    } satisfies RunHelperContext;
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
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const commandRunner = yield* CommandRunner;
        const invocationContext = getRuntimeCliInvocationContext();
        const runId =
          invocationContext.currentRunId ?? invocationContext.parentRunId ?? crypto.randomUUID();
        const perfDebug = yield* isPerfDebugEnabled();
        const toolDebug = yield* isToolDebugEnabled();
        const acpOnly = yield* isAcpOnlyEnabled();
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
          const child = PlatformCommand.make(executable, ...commandArgs).pipe(
            PlatformCommand.env({
              BUN_BE_BUN: '1',
              COMPOSIO_CLI_PARENT_RUN_ID: runId,
              COMPOSIO_PERF_DEBUG: perfDebug ? '1' : '0',
              COMPOSIO_TOOL_DEBUG: toolDebug ? '1' : '0',
              COMPOSIO_RUN_ACP_ONLY: acpOnly ? '1' : '0',
            }),
            PlatformCommand.stdin('inherit'),
            PlatformCommand.stdout('inherit'),
            PlatformCommand.stderr('inherit')
          );
          return Number(yield* commandRunner.run(child));
        }).pipe(
          Effect.ensuring(
            Effect.forEach(
              runCommand.cleanupPaths,
              cleanupPath => fs.remove(cleanupPath, { force: true }),
              { discard: true }
            ).pipe(Effect.orDie)
          )
        );
        process.exitCode = exitCode;
      }).pipe(Effect.scoped)
  )
);
