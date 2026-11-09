import { Effect, Option } from 'effect';
import { CommandSurface } from 'src/commands/surface';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  refreshConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { logToolDebug } from 'src/services/runtime-debug-logger';
import type { TerminalUI } from 'src/services/terminal-ui';
import {
  getOrFetchToolInputDefinition,
  invalidateToolInputDefinition,
  ToolInputValidationError,
} from 'src/services/tool-input-validation';
import { detectInBandWarning } from 'src/services/tools-executor';
import type { ToolExecuteParams, ToolsExecutor } from 'src/services/tools-executor';
import { redact } from 'src/ui/redact';
import {
  resolveExecuteContext,
  resolveSchemaContext,
  toolkitProjectScope,
  type ResolvedExecuteContext,
  type RunToolsExecuteParams,
} from './tools.execute.context';
import { perfDebugLog } from './tools.execute.debug';
import { invalidArguments, ReportedToolExecutionError } from './tools.execute.errors';
import { emitExecuteFailureTelemetry, handleExecutionError } from './tools.execute.failure';
import {
  ciRedactReplacer,
  connectionTips,
  describeStoredOutputSize,
  emitCachedSchema,
  executionSuccessSuffix,
  writeExecuteStdout,
  type DryRunSummary,
} from './tools.execute.format';
import { prepareExecuteOutput } from './tools.execute.output';
import { runParallelFromCommand } from './tools.execute.parallel';
import { checkDryRunArguments, validateToolInputBeforeExecute } from './tools.execute.validation';

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
      yield* perfDebugLog('execute.connected_toolkits.skipped', {
        slug: params.slug,
        reason: params.skipChecks ? 'skip-checks' : 'skip-connection-check',
      });
      return;
    }
    if (params.resolvedProject.projectType !== 'CONSUMER') return;

    yield* perfDebugLog('execute.connected_toolkits.refresh_start', {
      slug: params.slug,
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    });
    yield* refreshConsumerConnectedToolkitsCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    }).pipe(
      Effect.tap(() =>
        perfDebugLog('execute.connected_toolkits.refresh_end', {
          slug: params.slug,
          orgId: params.resolvedProject.orgId,
          consumerUserId: params.resolvedUserId,
          successful: true,
        })
      ),
      Effect.catch(() =>
        perfDebugLog('execute.connected_toolkits.refresh_end', {
          slug: params.slug,
          orgId: params.resolvedProject.orgId,
          consumerUserId: params.resolvedUserId,
          successful: false,
        })
      ),
      Effect.forkDetach,
      Effect.asVoid
    );

    const toolkit = yield* toolkitFromToolSlug(
      params.slug,
      toolkitProjectScope(params.resolvedProject)
    );
    if (!toolkit) return;

    const cachedToolkits = yield* getFreshConsumerConnectedToolkitsFromCache({
      orgId: params.resolvedProject.orgId,
      consumerUserId: params.resolvedUserId,
    });
    yield* perfDebugLog(
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
      yield* perfDebugLog('execute.connected_toolkits.fail_fast', {
        slug: params.slug,
        toolkit,
        orgId: params.resolvedProject.orgId,
        consumerUserId: params.resolvedUserId,
      });
      const message = `Toolkit "${toolkit}" is not connected for this user (cached within the last 5 minutes). If you just connected the account, use --skip-connection-check.`;
      yield* params.ui.log.error(message);
      yield* params.ui.note(
        connectionTips({ toolkit, toolSlug: params.slug, surface: params.surface }),
        'Tips'
      );
      yield* writeExecuteStdout(
        params.ui,
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
      return yield* new ReportedToolExecutionError({
        reason: 'connection_check',
        toolSlug: params.slug,
        message,
      });
    }
  });

const executeSessionHistoryScope = (resolvedProject: ResolvedExecuteContext['resolvedProject']) =>
  resolvedProject.projectType === 'CONSUMER'
    ? {
        orgId: resolvedProject.orgId,
        consumerUserId: resolvedProject.consumerUserId,
      }
    : {};

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

    yield* params.ui.useMakeSpinner(`Executing tool "${params.slug}"...`, spinner =>
      Effect.gen(function* () {
        if (params.dryRun) {
          const definition = yield* checkDryRunArguments({
            slug: params.slug,
            args: params.args,
            projectScope: {
              orgId: params.resolvedProject.orgId,
              projectId: params.resolvedProject.projectId,
            },
            verificationDisabled,
          }).pipe(
            Effect.tapError(error =>
              emitExecuteFailureTelemetry({
                toolSlug: params.slug,
                args: params.args,
                error,
                surface: params.surface,
                projectMode: params.projectMode,
                stage: 'dry_run',
                projectScope: toolkitProjectScope(params.resolvedProject),
              })
            )
          );
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
          yield* writeExecuteStdout(params.ui, JSON.stringify(summary, ciRedactReplacer, 2));
          yield* appendCliSessionHistory({
            ...executeSessionHistoryScope(params.resolvedProject),
            entry: {
              command: 'execute',
              status: 'dry-run',
              slug: params.slug,
              arguments: params.args,
            },
          }).pipe(Effect.catch(() => Effect.void));
          return;
        }

        yield* perfDebugLog('execute.tool_call.start', { slug: params.slug });
        const validateArgs = verificationDisabled
          ? Effect.void
          : validateToolInputBeforeExecute({
              slug: params.slug,
              args: params.args,
              resolvedProject: params.resolvedProject,
            });
        const result = yield* validateArgs.pipe(
          Effect.andThen(params.executor.execute(params.slug, params.executeParams)),
          Effect.matchEffect({
            onFailure: error =>
              Effect.gen(function* () {
                yield* logToolDebug('execute_result', { slug: params.slug, result: error });
                yield* perfDebugLog('execute.tool_call.end', {
                  slug: params.slug,
                  successful: false,
                });
                // The validation error points the user at the cached schema, so
                // it has to stay on disk.
                if (!(error instanceof ToolInputValidationError)) {
                  yield* invalidateToolInputDefinition(params.slug).pipe(
                    Effect.catch(() => Effect.void)
                  );
                }
                yield* spinner.error();
                const summary = yield* handleExecutionError(params.ui, error, {
                  toolSlug: params.slug,
                  args: params.args,
                  surface: params.surface,
                  projectMode: params.projectMode,
                  stage: 'execution',
                  projectScope: toolkitProjectScope(params.resolvedProject),
                });
                yield* writeExecuteStdout(
                  params.ui,
                  JSON.stringify({ successful: false, ...summary }, ciRedactReplacer, 2)
                );
                yield* appendCliSessionHistory({
                  ...executeSessionHistoryScope(params.resolvedProject),
                  entry: {
                    command: 'execute',
                    status: 'error',
                    slug: params.slug,
                    arguments: params.args,
                    error: summary.error,
                  },
                }).pipe(Effect.catch(() => Effect.void));
                return yield* new ReportedToolExecutionError({
                  reason: 'execution_failed',
                  toolSlug: params.slug,
                  message: summary.error,
                });
              }),
            onSuccess: result =>
              Effect.gen(function* () {
                yield* logToolDebug('execute_result', { slug: params.slug, result });
                yield* perfDebugLog('execute.tool_call.end', {
                  slug: params.slug,
                  successful: true,
                });
                return result;
              }),
          })
        );
        if (!result.successful) {
          yield* invalidateToolInputDefinition(params.slug).pipe(Effect.catch(() => Effect.void));
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
            projectScope: toolkitProjectScope(params.resolvedProject),
          });
          yield* writeExecuteStdout(params.ui, JSON.stringify(result, ciRedactReplacer, 2));
          return yield* new ReportedToolExecutionError({
            reason: 'execution_failed',
            toolSlug: params.slug,
            message: summary.error,
          });
        }

        yield* spinner.stop(`Execution successful${executionSuccessSuffix(result)}`);
        const inBandWarning = detectInBandWarning(result.data);
        if (inBandWarning) {
          yield* params.ui.log.warn(
            `The tool executed successfully but the response may contain an error: ${inBandWarning}`
          );
        }
        const output = yield* prepareExecuteOutput(params.slug, result, params.executeOutputDir);
        if (output.kind === 'file') {
          yield* params.ui.log.message(
            `Response stored in ${output.summary.outputFilePath} (${describeStoredOutputSize(output.summary)})`
          );
          yield* writeExecuteStdout(params.ui, JSON.stringify(output.summary, ciRedactReplacer, 2));
          yield* appendCliSessionHistory({
            ...executeSessionHistoryScope(params.resolvedProject),
            entry: {
              command: 'execute',
              status: 'success',
              slug: params.slug,
              arguments: params.args,
              storedInFile: true,
              outputFilePath: output.summary.outputFilePath,
              tokenCount: output.summary.tokenCount,
              sizeBytes: output.summary.sizeBytes,
              logId: result.logId,
            },
          }).pipe(Effect.catch(() => Effect.void));
          return;
        }

        yield* writeExecuteStdout(params.ui, output.json);
        yield* appendCliSessionHistory({
          ...executeSessionHistoryScope(params.resolvedProject),
          entry: {
            command: 'execute',
            status: 'success',
            slug: params.slug,
            arguments: params.args,
            storedInFile: false,
            logId: result.logId,
          },
        }).pipe(Effect.catch(() => Effect.void));
      })
    );
  });

const runToolsExecute = (params: RunToolsExecuteParams) =>
  Effect.gen(function* () {
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
            projectScope: toolkitProjectScope(context.resolvedProject),
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
    yield* logToolDebug('execute_params', {
      slug: params.slug,
      userId: context.resolvedUserId,
      connectedAccountId: context.selectedConnectedAccountId,
      arguments: context.args,
      projectId: context.resolvedProject.projectId,
      orgId: context.resolvedProject.orgId,
    });
    yield* perfDebugLog('execute.prepare', {
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

export type ToolsExecuteParams = {
  readonly slug: string;
  readonly additionalSlugs: ReadonlyArray<string>;
  readonly parallel: boolean;
  readonly data: Option.Option<string>;
  readonly file: Option.Option<string>;
  readonly account: Option.Option<string>;
  readonly getSchema: boolean;
  readonly dryRun: boolean;
  readonly skipConnectionCheck: boolean;
  readonly skipToolParamsCheck: boolean;
  readonly skipChecks: boolean;
};

/**
 * The handler of both `execute` (root tree, the consumer project) and `dev playground-execute`
 * (`dev` tree, the developer project, with the `dev` group's `--user-id` and `--project-name`).
 */
export const runToolsExecuteCommand = ({
  slug,
  additionalSlugs,
  parallel,
  data,
  file,
  account,
  getSchema,
  dryRun,
  skipConnectionCheck,
  skipToolParamsCheck,
  skipChecks,
}: ToolsExecuteParams) =>
  Effect.gen(function* () {
    const { tree, projectName } = yield* CommandSurface;
    const projectMode = tree === 'root' ? 'consumer' : 'developer';
    if (parallel) {
      return yield* runParallelFromCommand({
        surface: tree,
        projectMode,
        getSchema,
        dryRun,
        skipConnectionCheck,
        skipToolParamsCheck,
        skipChecks,
      });
    }
    if (additionalSlugs.length > 0) {
      return yield* invalidArguments('Additional tool slugs require --parallel.');
    }
    return yield* runToolsExecute({
      slug,
      data,
      file,
      account,
      projectName,
      surface: tree,
      projectMode,
      getSchema,
      dryRun,
      skipConnectionCheck,
      skipToolParamsCheck,
      skipChecks,
    });
  });
