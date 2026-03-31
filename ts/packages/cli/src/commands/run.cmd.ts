import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ts } from 'ts-morph';
import { APP_VERSION } from 'src/constants';
import { resolveCommandProject } from 'src/services/command-project';
import { type RunHelperContext } from 'src/services/run-helpers-runtime';
import { warmToolInputDefinitions } from 'src/services/tool-input-validation';
import { ComposioUserContext } from 'src/services/user-context';
import { isPerfDebugEnabled, isToolDebugEnabled } from 'src/services/runtime-debug-flags';
import { detectMaster } from 'src/services/master-detector';
import {
  repairMissingInstalledRunCompanionModules,
  resolveRunCompanionModulePath,
} from 'src/services/run-companion-modules';
import {
  appendCliSessionHistory,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { USER_COMPOSIO_DIR } from 'src/constants';

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
  Options.withDescription(
    'Compatibility flag. Helper logs are written to the run log file instead of stderr.'
  ),
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
  argv: ReadonlyArray<string> = process.argv
): ReadonlyArray<string> => {
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

  const resolvedEntrypoint = path.resolve(entrypoint);
  return fs.existsSync(resolvedEntrypoint)
    ? [process.execPath, resolvedEntrypoint]
    : [process.execPath];
};

type RunHelperModuleUrls = {
  readonly helpersRuntimeModuleUrl: string;
};

const resolveRunHelperModuleUrls = (): RunHelperModuleUrls => ({
  helpersRuntimeModuleUrl: pathToFileURL(
    resolveRunCompanionModulePath({
      callerImportMetaUrl: import.meta.url,
      execPath: process.execPath,
      relativeNoExtensionFromCaller: '../services/run-helpers-runtime',
    })
  ).href,
});

export const buildRunHelpersSource = (
  cliPrefix: ReadonlyArray<string>,
  context: RunHelperContext = {},
  moduleUrls: RunHelperModuleUrls = resolveRunHelperModuleUrls()
): string =>
  [
    `import { installRunHelpers } from ${JSON.stringify(moduleUrls.helpersRuntimeModuleUrl)};`,
    '',
    `await installRunHelpers(${JSON.stringify({ cliPrefix, helperContext: context })});`,
  ].join('\n');

const createRunHelpersPreloadFile = (
  cliPrefix: ReadonlyArray<string>,
  context: RunHelperContext,
  moduleUrls: RunHelperModuleUrls
) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-'));
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
  fs.mkdirSync(runOutputDir, { recursive: true });
  fs.writeFileSync(runLogFilePath, '', 'utf8');
  fs.writeFileSync(
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
    ),
    'utf8'
  );
  return { directory, preloadPath, runOutputDir, runLogFilePath };
};

export const buildRunCommand = ({
  file,
  args,
  preloadPath,
  preloadDirectory,
}: {
  file: Option.Option<string>;
  args: ReadonlyArray<string>;
  preloadPath: string;
  preloadDirectory: string;
}) => {
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
    fs.writeFileSync(
      wrapperFilePath,
      wrapFileSourceForRun(fs.readFileSync(filePath, 'utf8')),
      'utf8'
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

  throw new Error('Provide inline code or use --file to run a script file.');
};

const resolveRunHelperContext = () =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    const orgId = Option.getOrUndefined(userContext.data.orgId);
    const defaultComposioDir = path.join(os.homedir(), USER_COMPOSIO_DIR);
    const configuredCacheDir =
      process.env.COMPOSIO_CACHE_DIR?.trim() || process.env.CACHE_DIR?.trim() || defaultComposioDir;
    const baseReadAccessRoots = [
      ...new Set([defaultComposioDir, configuredCacheDir].map(value => path.resolve(value))),
    ];

    const baseContext = {
      apiKey,
      baseURL: userContext.data.baseURL,
      webURL: userContext.data.webURL,
      orgId,
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
        const runId = process.env.COMPOSIO_CLI_PARENT_RUN_ID ?? crypto.randomUUID();
        const perfDebug = isPerfDebugEnabled();
        const toolDebug = isToolDebugEnabled();
        const acpOnly = process.env.COMPOSIO_RUN_ACP_ONLY === '1';
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
          master: detectMaster(),
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
        const runHelperModuleUrls = yield* Effect.tryPromise({
          try: async () => {
            await repairMissingInstalledRunCompanionModules({
              callerImportMetaUrl: import.meta.url,
              execPath: process.execPath,
              appVersion: APP_VERSION,
            });

            return resolveRunHelperModuleUrls();
          },
          catch: error =>
            new Error(
              error instanceof Error
                ? error.message
                : `Failed to prepare the modules required by 'composio run': ${String(error)}`
            ),
        });
        const preload = createRunHelpersPreloadFile(
          inferCliInvocationPrefix(),
          helperContext,
          runHelperModuleUrls
        );
        let cleanupPaths: ReadonlyArray<string> = [];
        try {
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
          process.stderr.write(`RUN_LOG_FILE=${preload.runLogFilePath}\n`);
          const runCommand = buildRunCommand({
            file,
            args,
            preloadPath: preload.preloadPath,
            preloadDirectory: preload.directory,
          });
          cleanupPaths = runCommand.cleanupPaths;
          const child = Bun.spawn({
            cmd: runCommand.cmd,
            env: {
              ...process.env,
              BUN_BE_BUN: '1',
              COMPOSIO_CLI_PARENT_RUN_ID: runId,
              ...(perfDebug ? { COMPOSIO_PERF_DEBUG: '1' } : {}),
              ...(toolDebug ? { COMPOSIO_TOOL_DEBUG: '1' } : {}),
            },
            stdio: ['inherit', 'inherit', 'inherit'],
          });

          const exitCode = yield* Effect.promise(() => child.exited);
          process.exit(exitCode);
        } finally {
          for (const cleanupPath of cleanupPaths) {
            fs.rmSync(cleanupPath, { force: true });
          }
          fs.rmSync(preload.directory, { recursive: true, force: true });
        }
      })
  )
);
