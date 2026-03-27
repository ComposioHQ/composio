import { Args, Command, Options } from '@effect/cli';
import util from 'node:util';
import { Effect, Option, Either, Exit, Fiber, Cause } from 'effect';
import { encodingForModel } from 'js-tiktoken';
import { redact } from 'src/ui/redact';
import { parseJsonIsh } from 'src/utils/parse-json-ish';
import { toolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';
import { requireAuth } from 'src/effects/require-auth';
import { resolveOptionalTextInput } from 'src/effects/resolve-optional-text-input';
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
import { ToolsExecutor } from 'src/services/tools-executor';
import type { ToolExecuteParams, ToolExecuteResponse } from 'src/services/tools-executor';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { ProjectContext } from 'src/services/project-context';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import {
  getToolExecuteFailedEvent,
  getToolExecuteToolNotFoundEvent,
  getToolExecuteValidationFailedEvent,
  isMaybeToolValidationError,
  isMaybeToolNotFoundError,
} from 'src/analytics/events';
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
  refreshConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import {
  appendCliSessionHistory,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { storeCliSessionArtifact } from 'src/services/cli-session-artifacts';
import {
  ComposioNoActiveConnectionError,
  mapComposioError,
  normalizeCliError,
} from 'src/services/composio-error-overrides';

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

const getSchema = Options.boolean('get-schema').pipe(
  Options.withDescription('Fetch and print the raw tool schema without executing'),
  Options.withDefault(false)
);
const dryRun = Options.boolean('dry-run').pipe(
  Options.withDescription('Validate and preview the tool call without executing'),
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

const resolveInput = (input: Option.Option<string>) =>
  resolveOptionalTextInput(input, {
    // Default to empty object when no data provided (e.g. tools with no required args)
    missingValue: '{}',
  });

const parseArguments = (raw: string) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => parseJsonIsh(raw),
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

const connectionTips = (toolSlug: string, surface: 'root' | 'dev') => {
  const toolkit = toolkitFromToolSlug(toolSlug);
  const executeStep =
    surface === 'dev'
      ? commandHintStep('Retry', 'dev.playgroundExecute', {
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
      surface === 'dev' ? 'dev.connectedAccounts.link' : 'root.link',
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

const persistLargeExecuteOutput = (toolSlug: string, json: string, sharedDirectory?: string) =>
  Effect.gen(function* () {
    const outputFilePath = yield* storeCliSessionArtifact({
      contents: json,
      name: `${toolSlug}_OUTPUT`,
      extension: 'json',
      directoryPath: sharedDirectory?.trim() || process.env.COMPOSIO_RUN_OUTPUT_DIR?.trim(),
    });

    return {
      successful: true,
      error: null,
      logId: '',
      storedInFile: true,
      tokenCount: getExecuteOutputEncoder().encode(json).length,
      outputFilePath,
    } satisfies StoredExecuteOutputSummary;
  });

const perfDebugEpoch = Date.now();
const perfDebugLog = (label: string, details: Record<string, unknown> = {}) => {
  if (!isPerfDebugEnabled()) return;
  process.stderr.write(
    `[perf] ${JSON.stringify({
      phase: 'event',
      label,
      elapsedMs: Date.now() - perfDebugEpoch,
      ...details,
    })}\n`
  );
};
const toolDebugLog = (label: string, details: Record<string, unknown> = {}) => {
  if (!isToolDebugEnabled()) return;
  process.stderr.write(`[tool-debug] ${JSON.stringify({ label, ...details })}\n`);
};

const prepareExecuteOutput = (
  toolSlug: string,
  result: ToolExecuteResponse,
  sharedDirectory?: string
) =>
  Effect.gen(function* () {
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
        ...(yield* persistLargeExecuteOutput(toolSlug, json, sharedDirectory)),
        logId: result.logId,
      } satisfies StoredExecuteOutputSummary,
    };
  });

const emitExecuteFailureTelemetry = (params: {
  readonly toolSlug: string;
  readonly args: Record<string, unknown>;
  readonly error: unknown;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly stage: 'schema_fetch' | 'dry_run' | 'validation' | 'execution';
  readonly logId?: string;
  readonly mappedError?: ReturnType<typeof mapComposioError>;
}) =>
  Effect.gen(function* () {
    const normalized = params.mappedError?.normalized ?? normalizeCliError(params.error);
    const failureOrigin =
      normalized instanceof ToolInputValidationError || params.stage !== 'execution'
        ? ('fast_fail' as const)
        : ('main_endpoint' as const);

    if (normalized instanceof ToolInputValidationError) {
      yield* trackCliEventEffect(
        getToolExecuteValidationFailedEvent({
          toolSlug: params.toolSlug,
          args: params.args,
          error: normalized,
          surface: params.surface,
          projectMode: params.projectMode,
          stage: params.stage === 'dry_run' ? 'dry_run' : 'validation',
          failureOrigin,
          logId: params.logId,
        })
      );
      return;
    }

    const mapped =
      params.mappedError ??
      mapComposioError({
        error: params.error,
        toolSlug: params.toolSlug,
      });
    const apiDetails = mapped.apiDetails;
    const message = mapped.message;
    const errorSlug = mapped.slugValue;
    const status = apiDetails?.status;
    const apiCode = apiDetails?.code;
    const isNoConnectionError =
      normalized instanceof ComposioNoActiveConnectionError || Boolean(mapped.override);

    const event = isMaybeToolValidationError({
      message,
      errorSlug,
      apiCode,
    })
      ? getToolExecuteValidationFailedEvent({
          toolSlug: params.toolSlug,
          args: params.args,
          error: new ToolInputValidationError(params.toolSlug, 'server', [message]),
          surface: params.surface,
          projectMode: params.projectMode,
          stage:
            params.stage === 'dry_run'
              ? 'dry_run'
              : params.stage === 'validation'
                ? 'execution'
                : 'execution',
          failureOrigin,
          logId: params.logId,
        })
      : isMaybeToolNotFoundError({
            message,
            errorSlug,
            status,
            apiCode,
          })
        ? getToolExecuteToolNotFoundEvent({
            toolSlug: params.toolSlug,
            args: params.args,
            surface: params.surface,
            projectMode: params.projectMode,
            stage: params.stage === 'validation' ? 'execution' : params.stage,
            failureOrigin,
            logId: params.logId,
            errorSlug,
            status,
            apiCode,
            message,
          })
        : getToolExecuteFailedEvent({
            toolSlug: params.toolSlug,
            args: params.args,
            surface: params.surface,
            projectMode: params.projectMode,
            stage: params.stage === 'validation' ? 'execution' : params.stage,
            failureOrigin,
            logId: params.logId,
            errorSlug,
            status,
            apiCode,
            message,
            errorName: normalized instanceof Error ? normalized.name : undefined,
            isNoConnectionError,
          });

    yield* trackCliEventEffect(event);
  });

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
              commandHintStep('Browse available toolkits', 'dev.toolkits.list'),
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
  context: {
    toolSlug: string;
    args: Record<string, unknown>;
    surface: 'root' | 'dev';
    projectMode: 'consumer' | 'developer';
    stage: 'schema_fetch' | 'dry_run' | 'validation' | 'execution';
    logId?: string;
  }
) =>
  Effect.gen(function* () {
    const mapped = mapComposioError({ error, toolSlug: context.toolSlug });
    const normalized = mapped.normalized;
    if (normalized instanceof ToolInputValidationError) {
      yield* emitExecuteFailureTelemetry({
        toolSlug: context.toolSlug,
        args: context.args,
        error: normalized,
        surface: context.surface,
        projectMode: context.projectMode,
        stage: context.stage,
        logId: context.logId,
      });
      yield* ui.log.error(`Input validation failed for ${context.toolSlug}`);
      yield* ui.note(
        [`Schema: ${normalized.schemaPath}`, ...normalized.issues.map(issue => `- ${issue}`)].join(
          '\n'
        ),
        'Tool schema validation'
      );
      return { error: normalized.message, slug: context.toolSlug };
    }

    const apiDetails = mapped.apiDetails;
    const slugValue = mapped.slugValue;

    yield* emitExecuteFailureTelemetry({
      toolSlug: context.toolSlug,
      args: context.args,
      error,
      surface: context.surface,
      projectMode: context.projectMode,
      stage: context.stage,
      logId: context.logId,
      mappedError: mapped,
    });

    if (normalized instanceof ComposioNoActiveConnectionError) {
      yield* ui.log.error(mapped.message);
      if (toolkitFromToolSlug(context.toolSlug)) {
        yield* ui.note(connectionTips(context.toolSlug, context.surface), 'Tips');
      }
      return { error: mapped.message, slug: slugValue ?? context.toolSlug };
    }

    yield* ui.log.error(mapped.message);

    const detailsObject = apiDetails;
    if (detailsObject) {
      yield* ui.note(formatUnknownObject(redactRequestId(detailsObject)), 'Error details');
    }

    return { error: mapped.message, slug: slugValue };
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

const spawnBackgroundValidationGuard = (params: {
  readonly slug: string;
  readonly args: Record<string, unknown>;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
  };
}) =>
  Effect.gen(function* () {
    perfDebugLog('execute.validation.background_spawn', { slug: params.slug });
    const validationFiber = yield* validateToolInputArguments(params.slug, params.args, {
      orgId: params.resolvedProject.orgId,
      projectId: params.resolvedProject.projectId,
    }).pipe(Effect.forkDaemon);
    perfDebugLog('execute.validation.background_spawned', { slug: params.slug });
    return validationGuardFromFiber(validationFiber);
  });

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

type RunToolsExecuteParams = {
  slug: string;
  data: Option.Option<string>;
  userId: Option.Option<string>;
  projectName: Option.Option<string>;
  surface: 'root' | 'dev';
  projectMode: 'consumer' | 'developer';
  getSchema: boolean;
  dryRun: boolean;
  skipConnectionCheck: boolean;
  skipToolParamsCheck: boolean;
  skipChecks: boolean;
};

type SharedRunToolsExecuteParams = Omit<RunToolsExecuteParams, 'slug' | 'data'>;

type ParallelExecuteSpec = {
  readonly slug: string;
  readonly data: Option.Option<string>;
};

type ParsedParallelExecuteArgs = SharedRunToolsExecuteParams & {
  readonly specs: ReadonlyArray<ParallelExecuteSpec>;
};

type ParallelExecuteResult =
  | {
      readonly slug: string;
      readonly successful: true;
      readonly version: string | null;
      readonly schemaPath: string;
      readonly inputSchema: Record<string, unknown>;
    }
  | {
      readonly slug: string;
      readonly successful: false;
      readonly error: string;
    };

type ResolvedExecuteContext = {
  readonly ui: TerminalUI;
  readonly executor: ToolsExecutor;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
    readonly projectType: 'CONSUMER' | 'DEVELOPER';
    readonly consumerUserId?: string;
  };
  readonly args: Record<string, unknown>;
  readonly resolvedUserId: string;
  readonly executeParams: ToolExecuteParams;
  readonly executeOutputDir?: string;
};

type ResolvedSchemaContext = {
  readonly ui: TerminalUI;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
    readonly projectType: 'CONSUMER' | 'DEVELOPER';
    readonly consumerUserId?: string;
  };
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

const resolveExecuteContext = (params: RunToolsExecuteParams) =>
  Effect.gen(function* () {
    const resolvedProject = yield* resolveCommandProject({
      mode: params.projectMode,
      projectName:
        params.surface === 'root' ? undefined : Option.getOrUndefined(params.projectName),
    }).pipe(Effect.mapError(formatResolveCommandProjectError));
    const ui = yield* TerminalUI;
    const executor = yield* ToolsExecutor;
    const clientSingleton = yield* ComposioClientSingleton;
    const userContext = yield* ComposioUserContext;
    const projectContext = yield* ProjectContext;

    const input = (yield* resolveInput(params.data)) ?? '{}';
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
    const executeOutputDir =
      process.env.COMPOSIO_RUN_OUTPUT_DIR?.trim() ||
      Option.getOrUndefined(
        yield* resolveCliSessionArtifacts({
          orgId: resolvedProject.projectType === 'CONSUMER' ? resolvedProject.orgId : undefined,
          consumerUserId:
            resolvedProject.projectType === 'CONSUMER' ? resolvedProject.consumerUserId : undefined,
        }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
      );

    return {
      ui,
      executor,
      resolvedProject,
      args,
      resolvedUserId: resolvedUserId.value,
      executeOutputDir,
      executeParams: {
        userId: resolvedUserId.value,
        arguments: args,
        client,
      },
    } satisfies ResolvedExecuteContext;
  });

const resolveSchemaContext = (params: SharedRunToolsExecuteParams) =>
  Effect.gen(function* () {
    const resolvedProject = yield* resolveCommandProject({
      mode: params.projectMode,
      projectName:
        params.surface === 'root' ? undefined : Option.getOrUndefined(params.projectName),
    }).pipe(Effect.mapError(formatResolveCommandProjectError));
    const ui = yield* TerminalUI;

    return {
      ui,
      resolvedProject,
    } satisfies ResolvedSchemaContext;
  });

const runConnectedToolkitFailFast = (params: {
  readonly slug: string;
  readonly surface: 'root' | 'dev';
  readonly ui: TerminalUI;
  readonly resolvedProject: ResolvedExecuteContext['resolvedProject'];
  readonly resolvedUserId: string;
  readonly skipConnectionCheck: boolean;
  readonly skipChecks: boolean;
}) =>
  Effect.gen(function* () {
    if (params.skipConnectionCheck || params.skipChecks) {
      perfDebugLog('execute.connected_toolkits.skipped', {
        slug: params.slug,
        reason: params.skipChecks ? 'skip-checks' : 'skip-connection-check',
      });
      return;
    }
    if (params.resolvedProject.projectType !== 'CONSUMER') return;

    perfDebugLog('execute.connected_toolkits.refresh_start', {
      slug: params.slug,
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    });
    yield* refreshConsumerConnectedToolkitsCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() =>
          perfDebugLog('execute.connected_toolkits.refresh_end', {
            slug: params.slug,
            orgId: params.resolvedProject.orgId,
            consumerUserId: params.resolvedUserId,
            successful: true,
          })
        )
      ),
      Effect.catchAll(() =>
        Effect.sync(() =>
          perfDebugLog('execute.connected_toolkits.refresh_end', {
            slug: params.slug,
            orgId: params.resolvedProject.orgId,
            consumerUserId: params.resolvedUserId,
            successful: false,
          })
        )
      ),
      Effect.forkDaemon,
      Effect.asVoid
    );

    const toolkit = toolkitFromToolSlug(params.slug);
    if (!toolkit) return;

    const cachedToolkits = yield* getFreshConsumerConnectedToolkitsFromCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    });
    perfDebugLog(
      Option.isSome(cachedToolkits)
        ? 'execute.connected_toolkits.cache_hit'
        : 'execute.connected_toolkits.cache_miss',
      {
        slug: params.slug,
        toolkit,
        orgId: params.resolvedProject.orgId,
        consumerUserId: params.resolvedUserId,
        cachedToolkits: Option.isSome(cachedToolkits) ? cachedToolkits.value : undefined,
      }
    );

    if (Option.isSome(cachedToolkits) && !cachedToolkits.value.includes(toolkit)) {
      perfDebugLog('execute.connected_toolkits.fail_fast', {
        slug: params.slug,
        toolkit,
        orgId: params.resolvedProject.orgId,
        consumerUserId: params.resolvedUserId,
      });
      const message = `Toolkit "${toolkit}" is not connected for this user (cached within the last 5 minutes). If you just connected the account, use --skip-connection-check.`;
      yield* params.ui.log.error(message);
      yield* params.ui.note(connectionTips(params.slug, params.surface), 'Tips');
      yield* params.ui.output(
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
  });

// eslint-disable-next-line max-lines-per-function
const runExecuteWithSpinner = (params: {
  readonly slug: string;
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly dryRun: boolean;
  readonly ui: TerminalUI;
  readonly executor: ToolsExecutor;
  readonly resolvedProject: ResolvedExecuteContext['resolvedProject'];
  readonly args: Record<string, unknown>;
  readonly resolvedUserId: string;
  readonly executeParams: ToolExecuteParams;
  readonly executeOutputDir?: string;
  readonly skipToolParamsCheck: boolean;
  readonly skipChecks: boolean;
}) =>
  Effect.gen(function* () {
    const verificationDisabled = params.skipChecks || params.skipToolParamsCheck;
    const cachedDefinition = verificationDisabled
      ? null
      : yield* getCachedToolInputDefinition(params.slug);
    const validationState = verificationDisabled
      ? ({
          cacheHit: false,
          validationGuard: Effect.never,
          awaitCachedValidationDecision: null,
        } satisfies ValidationState)
      : yield* initializeValidationState({
          slug: params.slug,
          args: params.args,
          cachedDefinition,
          resolvedProject: params.resolvedProject,
        });

    yield* params.ui.useMakeSpinner(`Executing tool "${params.slug}"...`, spinner =>
      Effect.gen(function* () {
        let validationGuard = validationState.validationGuard;
        if (!verificationDisabled && !validationState.cacheHit) {
          validationGuard = yield* spawnBackgroundValidationGuard({
            slug: params.slug,
            args: params.args,
            resolvedProject: params.resolvedProject,
          });
        }

        if (params.dryRun) {
          const definition = verificationDisabled
            ? null
            : (cachedDefinition ??
              (yield* getOrFetchToolInputDefinition(params.slug, {
                orgId: params.resolvedProject.orgId,
                projectId: params.resolvedProject.projectId,
              }).pipe(
                Effect.tapError(error =>
                  emitExecuteFailureTelemetry({
                    toolSlug: params.slug,
                    args: params.args,
                    error,
                    surface: params.surface,
                    projectMode: params.projectMode,
                    stage: 'dry_run',
                  })
                )
              )));
          if (definition) {
            yield* validateToolInputArgumentsWithDefinition(
              params.slug,
              params.args,
              definition
            ).pipe(
              Effect.tapError(error =>
                emitExecuteFailureTelemetry({
                  toolSlug: params.slug,
                  args: params.args,
                  error,
                  surface: params.surface,
                  projectMode: params.projectMode,
                  stage: 'dry_run',
                })
              )
            );
          }
          const summary: DryRunSummary = {
            successful: true,
            dryRun: true,
            slug: params.slug,
            arguments: params.args,
            userId: params.resolvedUserId,
            schemaPath: definition?.schemaPath,
            schemaVersion: definition?.version,
          };
          yield* spinner.stop('Dry run successful');
          yield* params.ui.log.message(
            verificationDisabled
              ? 'No tool was executed. Local validation was skipped.'
              : 'No tool was executed. Arguments were validated locally only.'
          );
          yield* params.ui.output(JSON.stringify(summary, ciRedactReplacer, 2));
          yield* appendCliSessionHistory({
            orgId:
              params.resolvedProject.projectType === 'CONSUMER'
                ? params.resolvedProject.orgId
                : undefined,
            consumerUserId:
              params.resolvedProject.projectType === 'CONSUMER'
                ? params.resolvedProject.consumerUserId
                : undefined,
            entry: {
              command: 'execute',
              status: 'dry-run',
              slug: params.slug,
              arguments: params.args,
            },
          }).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        perfDebugLog('execute.tool_call.start', { slug: params.slug });
        const resultEither = yield* params.executor
          .execute(params.slug, params.executeParams)
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
          const summary = yield* handleExecutionError(params.ui, resultEither.left, {
            toolSlug: params.slug,
            args: params.args,
            surface: params.surface,
            projectMode: params.projectMode,
            stage: 'execution',
          });
          yield* params.ui.output(
            JSON.stringify({ successful: false, ...summary }, ciRedactReplacer, 2)
          );
          yield* appendCliSessionHistory({
            orgId:
              params.resolvedProject.projectType === 'CONSUMER'
                ? params.resolvedProject.orgId
                : undefined,
            consumerUserId:
              params.resolvedProject.projectType === 'CONSUMER'
                ? params.resolvedProject.consumerUserId
                : undefined,
            entry: {
              command: 'execute',
              status: 'error',
              slug: params.slug,
              arguments: params.args,
              error: summary.error,
            },
          }).pipe(Effect.catchAll(() => Effect.void));
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

          const summary = yield* handleExecutionError(params.ui, result.error ?? result, {
            toolSlug: params.slug,
            args: params.args,
            surface: params.surface,
            projectMode: params.projectMode,
            stage: 'execution',
            logId: result.logId,
          });
          yield* params.ui.output(JSON.stringify(result, ciRedactReplacer, 2));
          return yield* Effect.fail(new ToolExecutionError(summary.error));
        }

        const logId = result.logId
          ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
          : '';
        yield* spinner.stop(`Execution successful${logId}`);
        const output = yield* prepareExecuteOutput(params.slug, result, params.executeOutputDir);
        if (output.kind === 'file') {
          yield* params.ui.log.message(
            `Response stored in ${output.summary.outputFilePath} (${output.summary.tokenCount} tokens)`
          );
          yield* params.ui.output(JSON.stringify(output.summary, ciRedactReplacer, 2));
          yield* appendCliSessionHistory({
            orgId:
              params.resolvedProject.projectType === 'CONSUMER'
                ? params.resolvedProject.orgId
                : undefined,
            consumerUserId:
              params.resolvedProject.projectType === 'CONSUMER'
                ? params.resolvedProject.consumerUserId
                : undefined,
            entry: {
              command: 'execute',
              status: 'success',
              slug: params.slug,
              arguments: params.args,
              storedInFile: true,
              outputFilePath: output.summary.outputFilePath,
              tokenCount: output.summary.tokenCount,
              logId: result.logId,
            },
          }).pipe(Effect.catchAll(() => Effect.void));
          return;
        }

        yield* params.ui.log.message(`Response\n${output.json}`);
        yield* params.ui.output(output.json);
        yield* appendCliSessionHistory({
          orgId:
            params.resolvedProject.projectType === 'CONSUMER'
              ? params.resolvedProject.orgId
              : undefined,
          consumerUserId:
            params.resolvedProject.projectType === 'CONSUMER'
              ? params.resolvedProject.consumerUserId
              : undefined,
          entry: {
            command: 'execute',
            status: 'success',
            slug: params.slug,
            arguments: params.args,
            storedInFile: false,
            logId: result.logId,
          },
        }).pipe(Effect.catchAll(() => Effect.void));
      })
    );
  });

const runToolsExecute = (params: RunToolsExecuteParams) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    if (params.getSchema) {
      const context = yield* resolveSchemaContext(params);
      const definition = yield* getOrFetchToolInputDefinition(params.slug, {
        orgId: context.resolvedProject.orgId,
        projectId: context.resolvedProject.projectId,
      }).pipe(
        Effect.tapError(error =>
          emitExecuteFailureTelemetry({
            toolSlug: params.slug,
            args: {},
            error,
            surface: params.surface,
            projectMode: params.projectMode,
            stage: 'schema_fetch',
          })
        )
      );
      yield* emitCachedSchema(context.ui, params.slug, definition);
      return;
    }

    const context = yield* resolveExecuteContext(params);

    yield* runConnectedToolkitFailFast({
      slug: params.slug,
      surface: params.surface,
      ui: context.ui,
      resolvedProject: context.resolvedProject,
      resolvedUserId: context.resolvedUserId,
      skipConnectionCheck: params.skipConnectionCheck,
      skipChecks: params.skipChecks,
    });
    toolDebugLog('execute_params', {
      slug: params.slug,
      userId: context.resolvedUserId,
      arguments: context.args,
      projectId: context.resolvedProject.projectId,
      orgId: context.resolvedProject.orgId,
    });
    perfDebugLog('execute.prepare', {
      slug: params.slug,
      surface: params.surface,
      projectMode: params.projectMode,
    });
    yield* runExecuteWithSpinner({
      slug: params.slug,
      surface: params.surface,
      projectMode: params.projectMode,
      dryRun: params.dryRun,
      ui: context.ui,
      executor: context.executor,
      resolvedProject: context.resolvedProject,
      args: context.args,
      resolvedUserId: context.resolvedUserId,
      executeParams: context.executeParams,
      skipToolParamsCheck: params.skipToolParamsCheck,
      skipChecks: params.skipChecks,
    });
  });

const parseParallelExecuteArgs = (
  args: ReadonlyArray<string>,
  config: {
    readonly surface: 'root' | 'dev';
    readonly projectMode: 'consumer' | 'developer';
    readonly allowUserId: boolean;
    readonly allowProjectName: boolean;
  }
): ParsedParallelExecuteArgs => {
  let getSchema = false;
  let dryRun = false;
  let skipConnectionCheck = false;
  let skipToolParamsCheck = false;
  let skipChecks = false;
  let userId = Option.none<string>();
  let projectName = Option.none<string>();
  const specs: ParallelExecuteSpec[] = [];
  let currentSpec: ParallelExecuteSpec | null = null;

  const pushCurrentSpec = () => {
    if (!currentSpec) return;
    specs.push(currentSpec);
    currentSpec = null;
  };

  const readValue = (token: string, index: number) => {
    if (token.includes('=')) {
      return {
        value: token.slice(token.indexOf('=') + 1),
        nextIndex: index,
      };
    }

    const next = args[index + 1];
    if (!next) {
      throw new Error(`Missing value for ${token}.`);
    }
    return { value: next, nextIndex: index + 1 };
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) continue;

    if (token === '--parallel' || token === '-p') {
      continue;
    }
    if (token === '--get-schema') {
      getSchema = true;
      continue;
    }
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token === '--skip-connection-check') {
      skipConnectionCheck = true;
      continue;
    }
    if (token === '--skip-tool-params-check') {
      skipToolParamsCheck = true;
      continue;
    }
    if (token === '--skip-checks') {
      skipChecks = true;
      continue;
    }
    if (token === '--user-id' || token.startsWith('--user-id=')) {
      if (!config.allowUserId) {
        throw new Error(`${token} is not supported for this execute command.`);
      }
      const parsed = readValue(token, i);
      userId = Option.some(parsed.value);
      i = parsed.nextIndex;
      continue;
    }
    if (token === '--project-name' || token.startsWith('--project-name=')) {
      if (!config.allowProjectName) {
        throw new Error(`${token} is not supported for this execute command.`);
      }
      const parsed = readValue(token, i);
      projectName = Option.some(parsed.value);
      i = parsed.nextIndex;
      continue;
    }
    if (
      token === '--data' ||
      token === '-d' ||
      token.startsWith('--data=') ||
      token.startsWith('-d=')
    ) {
      if (!currentSpec) {
        throw new Error(
          `Expected a tool slug before ${token}. Use: composio execute --parallel TOOL_SLUG -d '{}' TOOL_SLUG_2 -d '{}'.`
        );
      }
      const parsed = readValue(token, i);
      currentSpec = {
        slug: currentSpec.slug,
        data: Option.some(parsed.value),
      };
      i = parsed.nextIndex;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown option for parallel execute: ${token}`);
    }

    pushCurrentSpec();
    currentSpec = {
      slug: token,
      data: Option.none(),
    };
  }

  pushCurrentSpec();

  if (specs.length === 0) {
    throw new Error(
      "No tool slugs were provided. Use: composio execute --parallel TOOL_SLUG -d '{}' TOOL_SLUG_2 -d '{}'."
    );
  }

  return {
    specs,
    userId,
    projectName,
    surface: config.surface,
    projectMode: config.projectMode,
    getSchema,
    dryRun,
    skipConnectionCheck,
    skipToolParamsCheck,
    skipChecks,
  };
};

const isParallelExecuteCommand = (argv: ReadonlyArray<string>) => {
  const args = argv.slice(2);
  if (args[0] === 'execute') {
    return {
      matched: args.includes('--parallel') || args.includes('-p'),
      tail: args.slice(1),
      surface: 'root' as const,
      projectMode: 'consumer' as const,
      allowUserId: false,
      allowProjectName: false,
    };
  }
  if (args[0] === 'dev' && args[1] === 'playground-execute') {
    return {
      matched: args.includes('--parallel') || args.includes('-p'),
      tail: args.slice(2),
      surface: 'dev' as const,
      projectMode: 'developer' as const,
      allowUserId: true,
      allowProjectName: true,
    };
  }
  return null;
};

const checkConnectedToolkitOrFail = (params: {
  readonly slug: string;
  readonly resolvedProject: ResolvedExecuteContext['resolvedProject'];
  readonly resolvedUserId: string;
  readonly skipConnectionCheck: boolean;
  readonly skipChecks: boolean;
}) =>
  Effect.gen(function* () {
    if (params.skipConnectionCheck || params.skipChecks) return;
    if (params.resolvedProject.projectType !== 'CONSUMER') return;

    yield* refreshConsumerConnectedToolkitsCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    }).pipe(
      Effect.catchAll(() => Effect.void),
      Effect.forkDaemon,
      Effect.asVoid
    );

    const toolkit = toolkitFromToolSlug(params.slug);
    if (!toolkit) return;

    const cachedToolkits = yield* getFreshConsumerConnectedToolkitsFromCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    });

    if (Option.isSome(cachedToolkits) && !cachedToolkits.value.includes(toolkit)) {
      throw new ToolExecutionError(
        `Toolkit "${toolkit}" is not connected for this user (cached within the last 5 minutes). If you just connected the account, use --skip-connection-check.`
      );
    }
  });

const runParallelSchemaFetchFromParsed = (params: ParsedParallelExecuteArgs) =>
  Effect.gen(function* () {
    const contexts = yield* Effect.forEach(
      params.specs,
      () =>
        resolveSchemaContext({
          userId: params.userId,
          projectName: params.projectName,
          surface: params.surface,
          projectMode: params.projectMode,
          getSchema: params.getSchema,
          dryRun: params.dryRun,
          skipConnectionCheck: params.skipConnectionCheck,
          skipToolParamsCheck: params.skipToolParamsCheck,
          skipChecks: params.skipChecks,
        }),
      { concurrency: 'unbounded' }
    );
    const entries = contexts.map((context, index) => ({
      context,
      spec: params.specs[index]!,
    }));

    const ui = contexts[0]?.ui;
    const results = yield* Effect.forEach(
      entries,
      ({ context, spec }) =>
        Effect.gen(function* () {
          const definition = yield* getOrFetchToolInputDefinition(spec.slug, {
            orgId: context.resolvedProject.orgId,
            projectId: context.resolvedProject.projectId,
          });
          return {
            slug: spec.slug,
            successful: true,
            version: definition.version,
            schemaPath: definition.schemaPath,
            inputSchema: definition.schema,
          } satisfies Extract<
            ParallelExecuteResult,
            { readonly inputSchema: Record<string, unknown> }
          >;
        }).pipe(
          Effect.catchAll(error => {
            const mapped = mapComposioError({ error, toolSlug: spec.slug });
            return Effect.succeed({
              slug: spec.slug,
              successful: false,
              error: mapped.message,
            } satisfies Extract<ParallelExecuteResult, { readonly successful: false }>);
          })
        ),
      { concurrency: 'unbounded' }
    );

    if (ui) {
      for (const result of results) {
        if (!result.successful) {
          yield* ui.log.error(`[${result.slug}] ${result.error}`);
          continue;
        }

        yield* ui.log.step(`[${result.slug}] Schema fetched: ${result.schemaPath}`);
      }

      const successful = results.every(result => result.successful);
      yield* ui.log.message(
        `Parallel execute completed: ${results.filter(result => result.successful).length}/${results.length} successful`
      );
      yield* ui.output(
        JSON.stringify(
          {
            successful,
            parallel: true,
            results,
          },
          ciRedactReplacer,
          2
        )
      );
      if (!successful) {
        return yield* Effect.fail(
          new ToolExecutionError('One or more parallel tool executions failed.')
        );
      }
    }
  });

const runParallelToolsExecuteFromParsed = (params: ParsedParallelExecuteArgs) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    if (params.getSchema) {
      return yield* runParallelSchemaFetchFromParsed(params);
    }

    const contexts = yield* Effect.forEach(
      params.specs,
      spec =>
        resolveExecuteContext({
          slug: spec.slug,
          data: spec.data,
          userId: params.userId,
          projectName: params.projectName,
          surface: params.surface,
          projectMode: params.projectMode,
          getSchema: params.getSchema,
          dryRun: params.dryRun,
          skipConnectionCheck: params.skipConnectionCheck,
          skipToolParamsCheck: params.skipToolParamsCheck,
          skipChecks: params.skipChecks,
        }),
      { concurrency: 'unbounded' }
    );
    const entries = contexts.map((context, index) => ({
      context,
      spec: params.specs[index]!,
    }));

    const ui = contexts[0]?.ui;
    const results = yield* Effect.forEach(
      entries,
      ({ context, spec }) =>
        Effect.gen(function* () {
          const toolSlug = spec.slug;

          try {
            yield* checkConnectedToolkitOrFail({
              slug: toolSlug,
              resolvedProject: context.resolvedProject,
              resolvedUserId: context.resolvedUserId,
              skipConnectionCheck: params.skipConnectionCheck,
              skipChecks: params.skipChecks,
            });

            if (params.dryRun) {
              const verificationDisabled = params.skipChecks || params.skipToolParamsCheck;
              const definition = verificationDisabled
                ? null
                : yield* getOrFetchToolInputDefinition(toolSlug, {
                    orgId: context.resolvedProject.orgId,
                    projectId: context.resolvedProject.projectId,
                  });
              if (definition) {
                yield* validateToolInputArgumentsWithDefinition(toolSlug, context.args, definition);
              }
              return {
                successful: true,
                dryRun: true,
                slug: toolSlug,
                arguments: context.args,
                userId: context.resolvedUserId,
                schemaPath: definition?.schemaPath,
                schemaVersion: definition?.version,
              } satisfies DryRunSummary;
            }

            if (!params.skipChecks && !params.skipToolParamsCheck) {
              const definition = yield* getOrFetchToolInputDefinition(toolSlug, {
                orgId: context.resolvedProject.orgId,
                projectId: context.resolvedProject.projectId,
              });
              yield* validateToolInputArgumentsWithDefinition(toolSlug, context.args, definition);
            }

            const result = yield* context.executor.execute(toolSlug, context.executeParams);
            if (!result.successful) {
              return {
                slug: toolSlug,
                successful: false,
                error: result.error ?? 'Execution failed.',
                logId: result.logId,
              };
            }

            const output = yield* prepareExecuteOutput(toolSlug, result, context.executeOutputDir);
            if (output.kind === 'file') {
              return {
                slug: toolSlug,
                ...output.summary,
              };
            }

            return {
              slug: toolSlug,
              ...result,
            };
          } catch (error) {
            const mapped = mapComposioError({ error, toolSlug });
            return {
              slug: toolSlug,
              successful: false,
              error: mapped.message,
            };
          }
        }),
      { concurrency: 'unbounded' }
    );

    if (ui) {
      for (const result of results) {
        if (!result.successful) {
          const logId =
            'logId' in result && typeof result.logId === 'string' && result.logId.length > 0
              ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
              : '';
          yield* ui.log.error(`[${result.slug}] ${result.error}${logId}`);
          continue;
        }

        if ('dryRun' in result && result.dryRun) {
          yield* ui.log.step(`[${result.slug}] Dry run successful`);
          continue;
        }

        if ('inputSchema' in result) {
          yield* ui.log.step(`[${result.slug}] Schema fetched: ${result.schemaPath}`);
          continue;
        }

        if ('storedInFile' in result && result.storedInFile) {
          yield* ui.log.step(
            `[${result.slug}] Response stored in ${result.outputFilePath} (${result.tokenCount} tokens)`
          );
          continue;
        }

        const logId =
          'logId' in result && typeof result.logId === 'string' && result.logId.length > 0
            ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
            : '';
        yield* ui.log.step(`[${result.slug}] Execution successful${logId}`);
        if ('data' in result) {
          yield* ui.note(serializeExecuteOutput(result), `Response: ${result.slug}`);
        }
      }
    }

    const successful = results.every(result => result.successful);
    if (ui) {
      yield* ui.log.message(
        `Parallel execute completed: ${results.filter(result => result.successful).length}/${results.length} successful`
      );
      yield* ui.output(
        JSON.stringify(
          {
            successful,
            parallel: true,
            results,
          },
          ciRedactReplacer,
          2
        )
      );
    }

    if (!successful) {
      return yield* Effect.fail(
        new ToolExecutionError('One or more parallel tool executions failed.')
      );
    }
  });

export const runParallelToolsExecuteFromArgv = (argv: ReadonlyArray<string>) => {
  const command = isParallelExecuteCommand(argv);
  if (!command?.matched) {
    return null;
  }

  return Effect.try({
    try: () =>
      parseParallelExecuteArgs(command.tail, {
        surface: command.surface,
        projectMode: command.projectMode,
        allowUserId: command.allowUserId,
        allowProjectName: command.allowProjectName,
      }),
    catch: error => (error instanceof Error ? error : new Error(String(error))),
  }).pipe(Effect.flatMap(runParallelToolsExecuteFromParsed));
};

export const rootToolsCmd$Execute = Command.make(
  'execute',
  { slug, data, getSchema, dryRun, skipConnectionCheck, skipToolParamsCheck, skipChecks },
  ({ slug, data, getSchema, dryRun, skipConnectionCheck, skipToolParamsCheck, skipChecks }) =>
    runToolsExecute({
      slug,
      data,
      userId: Option.none(),
      projectName: Option.none(),
      surface: 'root',
      projectMode: 'consumer',
      getSchema,
      dryRun,
      skipConnectionCheck,
      skipToolParamsCheck,
      skipChecks,
    })
).pipe(
  Command.withDescription(
    [
      'Execute a tool by slug. Validates inputs against cached schemas and checks connections',
      'automatically — just try it and it will tell you what to fix.',
      '',
      'Examples:',
      '  composio execute GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio execute --parallel GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com" }\'  GITHUB_CREATE_AN_ISSUE -d \'{ owner: "acme", repo: "app", title: "Bug" }\'',
      "  composio execute GMAIL_SEND_EMAIL --dry-run -d '{ ... }'   Preview without executing",
      '  composio execute GMAIL_SEND_EMAIL --get-schema              Fetch and print the input schema',
      '',
      'Flags:',
      '  -p, --parallel              Execute repeated TOOL_SLUG -d <json> groups concurrently',
      '  --skip-connection-check     Skip the connected-account check',
      '  --skip-tool-params-check    Skip input validation against cached schema',
      '  --skip-checks               Skip both checks above',
      '',
      'See also:',
      '  composio search "<query>"               Find tool slugs by use case',
      '  composio tools info <slug>              Schema summary with jq hints',
      '  composio link <toolkit>                 Connect an account for a toolkit',
    ].join('\n')
  )
);

export const devToolsCmd$Execute = Command.make(
  'playground-execute',
  {
    slug,
    data,
    userId,
    projectName,
    getSchema,
    dryRun,
    skipConnectionCheck,
    skipToolParamsCheck,
    skipChecks,
  },
  ({
    slug,
    data,
    userId,
    projectName,
    getSchema,
    dryRun,
    skipConnectionCheck,
    skipToolParamsCheck,
    skipChecks,
  }) =>
    runToolsExecute({
      slug,
      data,
      userId,
      projectName,
      surface: 'dev',
      projectMode: 'developer',
      getSchema,
      dryRun,
      skipConnectionCheck,
      skipToolParamsCheck,
      skipChecks,
    })
).pipe(
  Command.withDescription(
    [
      'Test tool executions against playground users using your developer project auth configs.',
      'Uses --user-id when provided, otherwise falls back to your local or global playground test user id.',
      'Arguments are validated against cached tool schemas in `~/.composio/tool_definitions/` when available.',
      '',
      'Examples:',
      '  composio dev playground-execute GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio dev playground-execute GMAIL_SEND_EMAIL --dry-run -d \'{ recipient_email: "a@b.com", body: "Hello" }\'',
      '  composio dev playground-execute GMAIL_SEND_EMAIL --get-schema',
      '',
      'Flags:',
      '  -p, --parallel              Execute repeated TOOL_SLUG -d <json> groups concurrently',
    ].join('\n')
  )
);
