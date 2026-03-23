import { Args, Command, Options } from '@effect/cli';
import * as fs from 'node:fs';
import * as path from 'node:path';
import util from 'node:util';
import { Effect, Option, Either, Exit, Fiber, Cause } from 'effect';
import { FileSystem } from '@effect/platform';
import { parse as parseJsonWithComments } from 'comment-json';
import { encodingForModel } from 'js-tiktoken';
import { redact } from 'src/ui/redact';
import { readStdin, readStdinIfPiped } from 'src/effects/read-stdin';
import { requireAuth } from 'src/effects/require-auth';
import {
  getCachedToolInputDefinition,
  getOrFetchToolInputDefinition,
  invalidateToolInputDefinition,
  refreshToolInputDefinitionIfVersionChanged,
  ToolInputValidationError,
  validateToolInputArguments,
  validateToolInputArgumentsWithDefinition,
} from 'src/services/tool-input-validation';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  ActionExecuteConnectedAccountNotFoundError,
  ToolsExecutor,
} from 'src/services/tools-executor';
import type { ToolExecuteParams, ToolExecuteResponse } from 'src/services/tools-executor';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { ProjectContext } from 'src/services/project-context';
import {
  extractApiErrorDetails,
  extractMessage,
  extractSlug,
} from 'src/utils/api-error-extraction';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { formatToolInputParameters } from '../format';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  resolveCommandProject,
  formatResolveCommandProjectError,
} from 'src/services/command-project';
import { commandHintStep } from 'src/services/command-hints';
import { isPerfDebugEnabled, isToolDebugEnabled } from 'src/services/runtime-debug-flags';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  primeConsumerConnectedToolkitsCacheInBackground,
} from 'src/services/consumer-connected-toolkits-cache';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Tool slug (e.g. "GITHUB_CREATE_ISSUE")')
);

const data = Options.text('data').pipe(
  Options.withAlias('d'),
  Options.withDescription('JSON arguments, @file, or - for stdin'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.optional,
  Options.withDescription('Developer-project user ID override')
);

const projectName = Options.text('project-name').pipe(
  Options.optional,
  Options.withDescription('Developer project name override for this command')
);

const getSchema = Options.boolean('get-schema').pipe(Options.withDefault(false));
const dryRun = Options.boolean('dry-run').pipe(Options.withDefault(false));

const resolveInput = (input: Option.Option<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (Option.isSome(input)) {
      const value = input.value.trim();
      if (value === '-') {
        return yield* readStdin;
      }
      if (value.startsWith('@')) {
        const filePath = value.slice(1).trim();
        if (!filePath) {
          return yield* Effect.fail(new Error('Missing file path after "@" in --data'));
        }
        return yield* fs.readFileString(filePath, 'utf-8');
      }
      return value;
    }

    const piped = yield* readStdinIfPiped;
    if (Option.isSome(piped)) {
      return piped.value;
    }

    // Default to empty object when no data provided (e.g. tools with no required args)
    return '{}';
  });

const parseArguments = (raw: string) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          try {
            return parseJsonWithComments(raw, undefined, true) as unknown;
          } catch {
            return Function(`"use strict"; return (${raw});`)() as unknown;
          }
        }
      },
      catch: () =>
        new Error(
          'Invalid JSON input. Provide JSON or a JS-style object literal, e.g. -d \'{ "key": "value" }\''
        ),
    });
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return yield* Effect.fail(
        new Error('Expected a JSON object for tool arguments, e.g. -d \'{ "key": "value" }\'')
      );
    }
    return parsed as Record<string, unknown>;
  });

const toolkitFromToolSlug = (toolSlug: string): string | undefined => {
  const idx = toolSlug.indexOf('_');
  if (idx <= 0) return toolSlug.toLowerCase();
  const prefix = toolSlug.slice(0, idx).toLowerCase();
  if (prefix === 'composio') return undefined;
  return prefix;
};

const connectionTips = (toolSlug: string, surface: 'root' | 'manage' | 'dev') => {
  const toolkit = toolkitFromToolSlug(toolSlug);
  const executeStep =
    surface === 'dev'
      ? commandHintStep('Retry', 'dev.execute', {
          slug: toolSlug,
          userId: '<user-id>',
          data: '...',
        })
      : commandHintStep('Retry', 'root.execute', { slug: toolSlug, data: '...' });
  if (!toolkit) {
    return executeStep;
  }
  return [
    commandHintStep(
      'Link the toolkit first',
      surface === 'dev' ? 'manage.connectedAccounts.link' : 'root.link',
      surface === 'dev' ? { toolkit, userId: '<user-id>' } : { toolkit }
    ),
    executeStep.replace('Retry:', 'Then retry:'),
  ].join('\n');
};

const ciRedactReplacer = (_key: string, value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (_key === 'logId') return redact({ value, prefix: 'log_' });
  if (_key === 'id' || _key.endsWith('Id') || _key.endsWith('_id')) {
    return redact({ value });
  }
  return value;
};

const formatUnknownObject = (value: object): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return util.inspect(value, { depth: 5, breakLength: 120 });
  }
};

const redactRequestId = (value: object): object => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const requestId = record.request_id;
  if (typeof requestId !== 'string') {
    return value;
  }
  return {
    ...record,
    request_id: redact({ value: requestId }),
  };
};

const EXECUTE_INLINE_OUTPUT_TOKEN_THRESHOLD = 10_000;
let executeOutputEncoder: ReturnType<typeof encodingForModel> | undefined;

const getExecuteOutputEncoder = () => {
  if (!executeOutputEncoder) {
    executeOutputEncoder = encodingForModel('gpt-4o');
  }
  return executeOutputEncoder;
};

type StoredExecuteOutputSummary = {
  readonly successful: true;
  readonly error: null;
  readonly logId: string;
  readonly storedInFile: true;
  readonly tokenCount: number;
  readonly outputFilePath: string;
};

const serializeExecuteOutput = (result: unknown): string =>
  JSON.stringify(result, ciRedactReplacer, 2);

const randomToken = (length = 16) => crypto.randomUUID().replace(/-/g, '').slice(0, length);

const persistLargeExecuteOutput = (json: string): StoredExecuteOutputSummary => {
  const directoryPath = path.join('/tmp/composio', randomToken());
  const outputHash = randomToken();
  const outputFilePath = path.join(directoryPath, `output-${outputHash}.json`);
  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(outputFilePath, json, 'utf8');

  return {
    successful: true,
    error: null,
    logId: '',
    storedInFile: true,
    tokenCount: getExecuteOutputEncoder().encode(json).length,
    outputFilePath,
  };
};

const perfDebugEpoch = Date.now();
const perfDebugLog = (label: string, details: Record<string, unknown> = {}) => {
  if (!isPerfDebugEnabled()) return;
  console.error(
    `[perf] ${JSON.stringify({
      phase: 'event',
      label,
      elapsedMs: Date.now() - perfDebugEpoch,
      ...details,
    })}`
  );
};
const toolDebugLog = (label: string, details: Record<string, unknown> = {}) => {
  if (!isToolDebugEnabled()) return;
  console.error(`[tool-debug] ${JSON.stringify({ label, ...details })}`);
};

const prepareExecuteOutput = (result: ToolExecuteResponse) => {
  const json = serializeExecuteOutput(result);
  const tokenCount = getExecuteOutputEncoder().encode(json).length;
  if (tokenCount <= EXECUTE_INLINE_OUTPUT_TOKEN_THRESHOLD) {
    return {
      kind: 'inline' as const,
      json,
    };
  }

  return {
    kind: 'file' as const,
    summary: {
      ...persistLargeExecuteOutput(json),
      logId: result.logId,
    } satisfies StoredExecuteOutputSummary,
  };
};

const normalizeError = (error: unknown): unknown => {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      return current;
    }

    if ('error' in current) {
      current = (current as { error?: unknown }).error;
      continue;
    }
    if ('cause' in current) {
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    break;
  }

  return current;
};

export const showToolsExecuteInputHelp = (toolSlug: string) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const toolOpt = yield* ui
      .withSpinner(`Fetching input parameters for "${toolSlug}"...`, repo.getToolDetailed(toolSlug))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Tool "${toolSlug}" not found.`,
            hint: [
              commandHintStep('Browse available toolkits', 'manage.toolkits.list'),
              commandHintStep('Then list tools', 'root.tools.list'),
            ].join('\n'),
            fallbackValue: Option.none(),
            searchForSuggestions: () =>
              repo.searchTools({ search: toolSlug, limit: 3 }).pipe(
                Effect.map(r =>
                  r.items.map(s => ({
                    label: `${s.slug} — ${s.description}`,
                    command: `> composio execute "${s.slug}" --help`,
                  }))
                )
              ),
          })
        )
      );

    if (Option.isNone(toolOpt)) return;
    const tool = toolOpt.value;

    yield* ui.note(formatToolInputParameters(tool), `Execute Help: ${tool.slug}`);
    yield* ui.log.step(`Run:\n> composio execute "${tool.slug}" -d '{"key":"value"}'`);
    yield* ui.output(
      JSON.stringify({ slug: tool.slug, input_parameters: tool.input_parameters }, null, 2)
    );
  });

const handleExecutionError = (
  ui: TerminalUI,
  error: unknown,
  context: { toolSlug: string; surface: 'root' | 'manage' | 'dev' }
) =>
  Effect.gen(function* () {
    const normalized = normalizeError(error);
    if (normalized instanceof ToolInputValidationError) {
      yield* ui.log.error(`Input validation failed for ${context.toolSlug}`);
      yield* ui.note(
        [`Schema: ${normalized.schemaPath}`, ...normalized.issues.map(issue => `- ${issue}`)].join(
          '\n'
        ),
        'Tool schema validation'
      );
      return { error: normalized.message, slug: context.toolSlug };
    }

    const connAccountDetails =
      normalized instanceof ActionExecuteConnectedAccountNotFoundError
        ? normalized.details
        : undefined;

    const apiDetails =
      extractApiErrorDetails(error) ??
      extractApiErrorDetails(normalized) ??
      extractApiErrorDetails(connAccountDetails);
    const slugValue = apiDetails?.slug ?? extractSlug(error) ?? extractSlug(connAccountDetails);
    const message = extractMessage(apiDetails) ?? extractMessage(normalized) ?? 'Unknown error';

    yield* ui.log.error(message);

    const detailsObject =
      apiDetails ??
      (normalized instanceof ActionExecuteConnectedAccountNotFoundError &&
      normalized.details &&
      typeof normalized.details === 'object'
        ? (normalized.details as object)
        : undefined);
    if (detailsObject) {
      yield* ui.note(formatUnknownObject(redactRequestId(detailsObject)), 'Error details');
    }

    if (normalized instanceof ActionExecuteConnectedAccountNotFoundError) {
      yield* ui.note(connectionTips(context.toolSlug, context.surface), 'Tips');
    }

    return { error: message, slug: slugValue };
  });

class ToolExecutionError {
  readonly _tag = 'ToolExecutionError';
  constructor(readonly message: string) {}
}

type CachedValidationDecision =
  | { readonly status: 'valid' | 'stale' }
  | { readonly status: 'fail'; readonly error: unknown };

type ValidationState = {
  readonly cacheHit: boolean;
  readonly validationGuard: Effect.Effect<never, unknown>;
  readonly awaitCachedValidationDecision: Effect.Effect<CachedValidationDecision, never> | null;
};

type CachedDefinition = {
  readonly schemaPath: string;
  readonly schema: Record<string, unknown>;
  readonly version: string | null;
} | null;

const validationGuardFromFiber = (validationFiber: Fiber.RuntimeFiber<unknown, unknown>) =>
  Fiber.await(validationFiber).pipe(
    Effect.flatMap(
      Exit.match({
        onFailure: cause => {
          const defect = Cause.failureOption(cause);
          if (Option.isSome(defect) && defect.value instanceof ToolInputValidationError) {
            return Effect.failCause(cause);
          }
          return Effect.never;
        },
        onSuccess: () => Effect.never,
      })
    )
  );

const initializeValidationState = (params: {
  readonly slug: string;
  readonly args: Record<string, unknown>;
  readonly cachedDefinition: CachedDefinition;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
  };
}) =>
  Effect.gen(function* () {
    if (!params.cachedDefinition) {
      perfDebugLog('execute.validation.cache_miss', { slug: params.slug });
      return {
        cacheHit: false,
        validationGuard: Effect.never,
        awaitCachedValidationDecision: null,
      } satisfies ValidationState;
    }
    const cachedDefinition = params.cachedDefinition;

    perfDebugLog('execute.validation.cache_hit', {
      slug: params.slug,
      cachedVersion: cachedDefinition.version,
    });
    const versionCheckFiber = yield* refreshToolInputDefinitionIfVersionChanged(
      params.slug,
      cachedDefinition.version,
      {
        orgId: params.resolvedProject.orgId,
        projectId: params.resolvedProject.projectId,
      }
    ).pipe(
      Effect.tap(result =>
        Effect.sync(() =>
          perfDebugLog('execute.validation.version_check_done', {
            slug: params.slug,
            cachedVersion: cachedDefinition.version,
            latestVersion: result.latestVersion,
            isStale: result.isStale,
          })
        )
      ),
      Effect.either,
      Effect.forkDaemon
    );
    const cachedValidationDecisionFiber = yield* Effect.gen(function* () {
      perfDebugLog('execute.validation.cached_start', { slug: params.slug });
      const result = yield* validateToolInputArgumentsWithDefinition(
        params.slug,
        params.args,
        cachedDefinition
      ).pipe(Effect.either);
      perfDebugLog('execute.validation.cached_end', {
        slug: params.slug,
        successful: Either.isRight(result),
      });
      if (Either.isRight(result)) {
        return { status: 'valid' as const };
      }

      const freshnessEither = yield* Fiber.join(versionCheckFiber);
      const isStale = Either.isRight(freshnessEither) && freshnessEither.right.isStale;
      perfDebugLog('execute.validation.cached_failed', {
        slug: params.slug,
        cacheStillCurrent: !isStale,
      });
      return isStale
        ? { status: 'stale' as const }
        : { status: 'fail' as const, error: result.left };
    }).pipe(Effect.forkDaemon);
    const awaitCachedValidationDecision = Fiber.join(
      cachedValidationDecisionFiber
    ) as Effect.Effect<CachedValidationDecision, never>;

    return {
      cacheHit: true,
      awaitCachedValidationDecision,
      validationGuard: awaitCachedValidationDecision.pipe(
        Effect.flatMap(decision => {
          if (decision.status === 'fail') {
            return Effect.fail(decision.error);
          }

          return Effect.never;
        })
      ),
    } satisfies ValidationState;
  });

type DryRunSummary = {
  readonly successful: true;
  readonly dryRun: true;
  readonly slug: string;
  readonly arguments: Record<string, unknown>;
  readonly userId: string;
  readonly schemaPath?: string;
  readonly schemaVersion?: string | null;
};

const emitCachedSchema = (
  ui: TerminalUI,
  slug: string,
  definition: {
    readonly version: string | null;
    readonly schemaPath: string;
    readonly schema: Record<string, unknown>;
  }
) =>
  Effect.gen(function* () {
    yield* ui.log.message(
      `Schema saved, inspect keys like: jq '{required: (.inputSchema.required // []), keys: (.inputSchema.properties | keys)}' ${definition.schemaPath}`
    );
    yield* ui.output(
      JSON.stringify(
        {
          slug,
          version: definition.version,
          schemaPath: definition.schemaPath,
          inputSchema: definition.schema,
        },
        null,
        2
      )
    );
  });

const runToolsExecute = (params: {
  slug: string;
  data: Option.Option<string>;
  userId: Option.Option<string>;
  projectName: Option.Option<string>;
  surface: 'root' | 'manage' | 'dev';
  projectMode: 'consumer' | 'developer';
  getSchema: boolean;
  dryRun: boolean;
}) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const resolvedProject = yield* resolveCommandProject({
      mode: params.projectMode,
      projectName:
        params.surface === 'root' ? undefined : Option.getOrUndefined(params.projectName),
    }).pipe(Effect.mapError(formatResolveCommandProjectError));
    const ui = yield* TerminalUI;
    if (params.getSchema) {
      const definition = yield* getOrFetchToolInputDefinition(params.slug, {
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });
      yield* emitCachedSchema(ui, params.slug, definition);
      return;
    }

    const executor = yield* ToolsExecutor;
    const clientSingleton = yield* ComposioClientSingleton;
    const userContext = yield* ComposioUserContext;
    const projectContext = yield* ProjectContext;

    const input = yield* resolveInput(params.data);
    const args = yield* parseArguments(input);
    const localProjectContext = yield* projectContext.resolve.pipe(
      Effect.catchAll(() => Effect.succeed(Option.none()))
    );
    const localTestUserId = Option.flatMap(localProjectContext, keys => keys.testUserId);
    const resolvedUserId =
      resolvedProject.projectType === 'CONSUMER'
        ? Option.fromNullable(resolvedProject.consumerUserId)
        : Option.match(params.userId, {
            onSome: value => Option.some(value),
            onNone: () => Option.orElse(localTestUserId, () => userContext.data.testUserId),
          });
    if (Option.isNone(resolvedUserId)) {
      return yield* Effect.fail(
        new Error(
          params.projectMode === 'developer'
            ? 'Missing user id. Provide --user-id or run `composio dev init` to set a playground test user id.'
            : 'Missing user id. Provide --user-id or run composio login to set global test_user_id.'
        )
      );
    }
    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });

    const executeParams: ToolExecuteParams = {
      userId: resolvedUserId.value,
      arguments: args,
      client,
    };
    if (resolvedProject.projectType === 'CONSUMER') {
      yield* primeConsumerConnectedToolkitsCacheInBackground({
        orgId: resolvedProject.orgId,
        consumerUserId: resolvedUserId.value,
      });
      const toolkit = toolkitFromToolSlug(params.slug);
      if (toolkit) {
        const cachedToolkits = yield* getFreshConsumerConnectedToolkitsFromCache({
          orgId: resolvedProject.orgId,
          consumerUserId: resolvedUserId.value,
        });
        if (Option.isSome(cachedToolkits) && !cachedToolkits.value.includes(toolkit)) {
          const message = `Toolkit "${toolkit}" is not connected for this consumer user (cached within the last 5 minutes).`;
          yield* ui.log.error(message);
          yield* ui.note(connectionTips(params.slug, params.surface), 'Tips');
          yield* ui.output(
            JSON.stringify(
              {
                successful: false,
                error: message,
                slug: params.slug,
              },
              ciRedactReplacer,
              2
            )
          );
          return yield* Effect.fail(new ToolExecutionError(message));
        }
      }
    }
    toolDebugLog('execute_params', {
      slug: params.slug,
      userId: resolvedUserId.value,
      arguments: args,
      projectId: resolvedProject.projectId,
      orgId: resolvedProject.orgId,
    });
    perfDebugLog('execute.prepare', {
      slug: params.slug,
      surface: params.surface,
      projectMode: params.projectMode,
    });
    const cachedDefinition = yield* getCachedToolInputDefinition(params.slug);
    const validationState = yield* initializeValidationState({
      slug: params.slug,
      args,
      cachedDefinition,
      resolvedProject,
    });

    yield* ui.useMakeSpinner(`Executing tool "${params.slug}"...`, spinner =>
      Effect.gen(function* () {
        let validationGuard = validationState.validationGuard;
        if (!validationState.cacheHit) {
          perfDebugLog('execute.validation.background_start', { slug: params.slug });
          const validationFiber = yield* validateToolInputArguments(params.slug, args, {
            orgId: resolvedProject.orgId,
            projectId: resolvedProject.projectId,
          }).pipe(Effect.forkDaemon);
          validationGuard = validationGuardFromFiber(validationFiber);
        }

        if (params.dryRun) {
          const definition =
            cachedDefinition ??
            (yield* getOrFetchToolInputDefinition(params.slug, {
              orgId: resolvedProject.orgId,
              projectId: resolvedProject.projectId,
            }));
          yield* validateToolInputArgumentsWithDefinition(params.slug, args, definition);
          const summary: DryRunSummary = {
            successful: true,
            dryRun: true,
            slug: params.slug,
            arguments: args,
            userId: resolvedUserId.value,
            schemaPath: definition.schemaPath,
            schemaVersion: definition.version,
          };
          yield* spinner.stop('Dry run successful');
          yield* ui.log.message('No tool was executed. Arguments were validated locally only.');
          yield* ui.output(JSON.stringify(summary, ciRedactReplacer, 2));
          return;
        }

        perfDebugLog('execute.tool_call.start', { slug: params.slug });
        const resultEither = yield* executor
          .execute(params.slug, executeParams)
          .pipe(Effect.raceFirst(validationGuard))
          .pipe(Effect.either);
        toolDebugLog('execute_result', {
          slug: params.slug,
          result: Either.isRight(resultEither) ? resultEither.right : resultEither.left,
        });
        perfDebugLog('execute.tool_call.end', {
          slug: params.slug,
          successful: Either.isRight(resultEither),
        });

        if (Either.isLeft(resultEither)) {
          yield* invalidateToolInputDefinition(params.slug).pipe(
            Effect.catchAll(() => Effect.void)
          );
          yield* spinner.error();
          const summary = yield* handleExecutionError(ui, resultEither.left, {
            toolSlug: params.slug,
            surface: params.surface,
          });
          yield* ui.output(JSON.stringify({ successful: false, ...summary }, ciRedactReplacer, 2));
          return yield* Effect.fail(new ToolExecutionError(summary.error));
        }

        const result = resultEither.right;
        if (validationState.awaitCachedValidationDecision) {
          const decision = yield* validationState.awaitCachedValidationDecision;
          if (decision.status === 'fail') {
            perfDebugLog('execute.validation.post_success_failure_ignored', {
              slug: params.slug,
            });
          }
        }

        if (!result.successful) {
          yield* invalidateToolInputDefinition(params.slug).pipe(
            Effect.catchAll(() => Effect.void)
          );
          const logId = result.logId
            ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
            : '';
          yield* spinner.error(`Execution failed${logId}`);

          const summary = yield* handleExecutionError(ui, result.error ?? result, {
            toolSlug: params.slug,
            surface: params.surface,
          });
          yield* ui.output(JSON.stringify(result, ciRedactReplacer, 2));
          return yield* Effect.fail(new ToolExecutionError(summary.error));
        }

        const logId = result.logId
          ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
          : '';
        yield* spinner.stop(`Execution successful${logId}`);
        const output = prepareExecuteOutput(result);
        if (output.kind === 'file') {
          yield* ui.log.message(
            `Response stored in ${output.summary.outputFilePath} (${output.summary.tokenCount} tokens)`
          );
          yield* ui.output(JSON.stringify(output.summary, ciRedactReplacer, 2));
          return;
        }

        yield* ui.log.message(`Response\n${output.json}`);
        yield* ui.output(output.json);
      })
    );
  });

export const toolsCmd$Execute = Command.make(
  'execute',
  { slug, data, userId, projectName, getSchema, dryRun },
  ({ slug, data, userId, projectName, getSchema, dryRun }) =>
    runToolsExecute({
      slug,
      data,
      userId,
      projectName,
      surface: 'manage',
      projectMode: 'consumer',
      getSchema,
      dryRun,
    })
).pipe(
  Command.withDescription(
    [
      'Execute a tool by slug with JSON arguments, or preview it locally with --dry-run.',
      'Arguments are validated against cached tool schemas in `~/.composio/tool_definitions/` when available.',
      'Use `--get-schema` to fetch the latest raw input schema into the cache and print it without executing the tool.',
      'Use `composio tools info <slug>` for the same schema plus a short human summary and jq hints.',
      'Successful execute responses are parsed immediately, and failed calls validate inputs against cached schemas when available, so it is often fastest to just try the real call first before inspecting schema.',
      '',
      'Examples:',
      '  composio execute GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio execute GMAIL_SEND_EMAIL --dry-run -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio execute GMAIL_SEND_EMAIL --get-schema',
      '',
      'Related:',
      '  composio run \'const first = await execute("TOOL_SLUG", { ... }); const second = await execute("OTHER_TOOL", { ... }); console.log({ first, second })\'',
      '  composio search "<query>"',
      '  composio link <toolkit>',
    ].join('\n')
  )
);

export const rootToolsCmd$Execute = Command.make(
  'execute',
  { slug, data, getSchema, dryRun },
  ({ slug, data, getSchema, dryRun }) =>
    runToolsExecute({
      slug,
      data,
      userId: Option.none(),
      projectName: Option.none(),
      surface: 'root',
      projectMode: 'consumer',
      getSchema,
      dryRun,
    })
).pipe(
  Command.withDescription(
    [
      'Execute a tool by slug with JSON arguments, or preview it locally with --dry-run.',
      'Arguments are validated against cached tool schemas in `~/.composio/tool_definitions/` when available.',
      'Use `--get-schema` to fetch the latest raw input schema into the cache and print it without executing the tool.',
      'Use `composio tools info <slug>` for the same schema plus a short human summary and jq hints.',
      'Successful execute responses are parsed immediately, and failed calls validate inputs against cached schemas when available, so it is often fastest to just try the real call first before inspecting schema.',
      '',
      'Examples:',
      '  composio execute GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio execute GMAIL_SEND_EMAIL --dry-run -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio execute GMAIL_SEND_EMAIL --get-schema',
      '',
      'Related:',
      '  composio run \'const first = await execute("TOOL_SLUG", { ... }); const second = await execute("OTHER_TOOL", { ... }); console.log({ first, second })\'',
      '  composio search "<query>"',
      '  composio link <toolkit>',
    ].join('\n')
  )
);

export const devToolsCmd$Execute = Command.make(
  'execute',
  { slug, data, userId, projectName, getSchema, dryRun },
  ({ slug, data, userId, projectName, getSchema, dryRun }) =>
    runToolsExecute({
      slug,
      data,
      userId,
      projectName,
      surface: 'dev',
      projectMode: 'developer',
      getSchema,
      dryRun,
    })
).pipe(
  Command.withDescription(
    [
      'Execute a tool with your playground test user id against your developer project auth configs.',
      'Uses --user-id when provided, otherwise falls back to your local or global playground test user id.',
      'Arguments are validated against cached tool schemas in `~/.composio/tool_definitions/` when available.',
      '',
      'Examples:',
      '  composio dev execute GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio dev execute GMAIL_SEND_EMAIL --dry-run -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio dev execute GMAIL_SEND_EMAIL --get-schema',
    ].join('\n')
  )
);
