import { Effect, Option } from 'effect';
import { CommandSurface } from 'src/commands/surface';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';
import { logToolDebug } from 'src/services/runtime-debug-logger';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  getOrFetchToolInputDefinition,
  invalidateToolInputDefinition,
  ToolInputValidationError,
} from 'src/services/tool-input-validation';
import { detectInBandWarning } from 'src/services/tools-executor';
import { escapeTerminalText } from 'src/ui/escape-terminal-text';
import { redact } from 'src/ui/redact';
import {
  checkPreparedCallConnection,
  previewPreparedCall,
  runPreparedCall,
} from './tools.execute.call';
import {
  prepareExecuteCall,
  resolveSchemaContext,
  toolkitProjectScope,
  type PreparedExecuteCall,
  type RunToolsExecuteParams,
} from './tools.execute.context';
import { perfDebugLog } from './tools.execute.debug';
import { invalidArguments, ReportedToolExecutionError } from './tools.execute.errors';
import {
  emitExecuteFailureTelemetry,
  handleExecutionError,
  inspectExecuteFailure,
  inspectFailedResponse,
  printExecuteRetryAdvice,
} from './tools.execute.failure';
import {
  ciRedactReplacer,
  connectionTips,
  describeStoredOutputSize,
  emitCachedSchema,
  executionSuccessSuffix,
  writeExecuteStdout,
} from './tools.execute.format';
import { prepareExecuteOutput } from './tools.execute.output';
import { runParallelToolsExecute } from './tools.execute.parallel';
import { readParallelExecuteArgv } from './tools.execute.parallel-argv';

const runConnectedToolkitFailFast = (
  call: PreparedExecuteCall,
  params: Pick<RunToolsExecuteParams, 'surface' | 'skipConnectionCheck' | 'skipChecks'>,
  ui: TerminalUI
) =>
  Effect.gen(function* () {
    const missing = yield* checkPreparedCallConnection(call, {
      skipConnectionCheck: params.skipConnectionCheck,
      skipChecks: params.skipChecks,
      debug: true,
    });
    if (Option.isNone(missing)) return;

    const { toolkit, message } = missing.value;
    yield* ui.log.error(message);
    yield* ui.note(
      connectionTips({ toolkit, toolSlug: call.slug, surface: params.surface }),
      'Tips'
    );
    yield* writeExecuteStdout(
      ui,
      JSON.stringify({ successful: false, error: message, slug: call.slug }, ciRedactReplacer, 2)
    );
    return yield* new ReportedToolExecutionError({
      reason: 'connection_check',
      toolSlug: call.slug,
      message,
    });
  });

const executeSessionHistoryScope = (resolvedProject: PreparedExecuteCall['resolvedProject']) =>
  resolvedProject.projectType === 'CONSUMER'
    ? {
        orgId: resolvedProject.orgId,
        consumerUserId: resolvedProject.consumerUserId,
      }
    : {};

const runExecuteWithSpinner = (
  call: PreparedExecuteCall,
  params: Pick<
    RunToolsExecuteParams,
    'surface' | 'projectMode' | 'dryRun' | 'skipToolParamsCheck' | 'skipChecks'
  >,
  ui: TerminalUI
) =>
  Effect.gen(function* () {
    const { slug, args, resolvedProject } = call;
    const verificationDisabled = params.skipChecks || params.skipToolParamsCheck;

    yield* ui.useMakeSpinner(`Executing tool "${slug}"...`, spinner =>
      Effect.gen(function* () {
        if (params.dryRun) {
          const summary = yield* previewPreparedCall(call, verificationDisabled).pipe(
            Effect.tapError(error =>
              emitExecuteFailureTelemetry({
                toolSlug: slug,
                args,
                error,
                surface: params.surface,
                projectMode: params.projectMode,
                stage: 'dry_run',
                projectScope: toolkitProjectScope(resolvedProject),
              })
            )
          );
          yield* spinner.stop('Dry run successful');
          yield* ui.log.message(
            verificationDisabled
              ? 'No tool was executed. Local validation was skipped.'
              : 'No tool was executed. Arguments were validated locally only.'
          );
          yield* writeExecuteStdout(ui, JSON.stringify(summary, ciRedactReplacer, 2));
          yield* appendCliSessionHistory({
            ...executeSessionHistoryScope(resolvedProject),
            entry: {
              command: 'execute',
              status: 'dry-run',
              slug,
              arguments: args,
            },
          }).pipe(Effect.catch(() => Effect.void));
          return;
        }

        yield* perfDebugLog('execute.tool_call.start', { slug });
        const result = yield* runPreparedCall(
          call,
          verificationDisabled ? 'skip' : 'best-effort'
        ).pipe(
          Effect.matchEffect({
            onFailure: error =>
              Effect.gen(function* () {
                yield* logToolDebug('execute_result', { slug, result: error });
                yield* perfDebugLog('execute.tool_call.end', {
                  slug,
                  successful: false,
                });
                // The validation error points the user at the cached schema, so
                // it has to stay on disk.
                if (!(error instanceof ToolInputValidationError)) {
                  yield* invalidateToolInputDefinition(slug).pipe(Effect.catch(() => Effect.void));
                }
                yield* spinner.error();
                const scope = {
                  toolSlug: slug,
                  surface: params.surface,
                  projectScope: toolkitProjectScope(resolvedProject),
                };
                const failure = yield* inspectExecuteFailure(error, scope);
                const summary = yield* handleExecutionError(ui, failure, {
                  ...scope,
                  args,
                  projectMode: params.projectMode,
                  stage: 'execution',
                });
                // Whether the request can be sent again as it is: `"retry": "safe"` (exit 75) or
                // `"retry": "check-first"` when it may have run before it failed.
                const retry = Option.getOrUndefined(failure.retry);
                if (retry !== undefined) {
                  yield* printExecuteRetryAdvice(ui, retry, params.surface);
                }
                yield* writeExecuteStdout(
                  ui,
                  JSON.stringify(
                    { successful: false, ...summary, ...(retry === undefined ? {} : { retry }) },
                    ciRedactReplacer,
                    2
                  )
                );
                yield* appendCliSessionHistory({
                  ...executeSessionHistoryScope(resolvedProject),
                  entry: {
                    command: 'execute',
                    status: 'error',
                    slug,
                    arguments: args,
                    error: summary.error,
                  },
                }).pipe(Effect.catch(() => Effect.void));
                return yield* new ReportedToolExecutionError({
                  reason: 'execution_failed',
                  toolSlug: slug,
                  message: summary.error,
                  ...(retry === 'safe' ? { retryable: true } : {}),
                });
              }),
            onSuccess: result =>
              Effect.gen(function* () {
                yield* logToolDebug('execute_result', { slug, result });
                yield* perfDebugLog('execute.tool_call.end', {
                  slug,
                  successful: true,
                });
                return result;
              }),
          })
        );
        if (!result.successful) {
          yield* invalidateToolInputDefinition(slug).pipe(Effect.catch(() => Effect.void));
          const logId = result.logId
            ? ` (logId: ${escapeTerminalText(redact({ value: result.logId, prefix: 'log_' }))})`
            : '';
          yield* spinner.error(`Execution failed${logId}`);

          const scope = {
            toolSlug: slug,
            surface: params.surface,
            projectScope: toolkitProjectScope(resolvedProject),
          };
          const failure = yield* inspectFailedResponse(result, scope);
          const summary = yield* handleExecutionError(ui, failure, {
            ...scope,
            args,
            projectMode: params.projectMode,
            stage: 'execution',
            logId: result.logId,
          });
          yield* writeExecuteStdout(ui, JSON.stringify(result, ciRedactReplacer, 2));
          return yield* new ReportedToolExecutionError({
            reason: 'execution_failed',
            toolSlug: slug,
            message: summary.error,
          });
        }

        yield* spinner.stop(`Execution successful${executionSuccessSuffix(result)}`);
        const inBandWarning = detectInBandWarning(result.data);
        if (inBandWarning) {
          yield* ui.log.warn(
            `The tool executed successfully but the response may contain an error: ${escapeTerminalText(inBandWarning)}`
          );
        }
        const output = yield* prepareExecuteOutput(slug, result);
        if (output.kind === 'file') {
          yield* ui.log.message(
            `Response stored in ${output.summary.outputFilePath} (${describeStoredOutputSize(output.summary)})`
          );
          yield* writeExecuteStdout(ui, JSON.stringify(output.summary, ciRedactReplacer, 2));
          yield* appendCliSessionHistory({
            ...executeSessionHistoryScope(resolvedProject),
            entry: {
              command: 'execute',
              status: 'success',
              slug,
              arguments: args,
              storedInFile: true,
              outputFilePath: output.summary.outputFilePath,
              tokenCount: output.summary.tokenCount,
              sizeBytes: output.summary.sizeBytes,
              logId: result.logId,
            },
          }).pipe(Effect.catch(() => Effect.void));
          return;
        }

        yield* writeExecuteStdout(ui, output.json);
        yield* appendCliSessionHistory({
          ...executeSessionHistoryScope(resolvedProject),
          entry: {
            command: 'execute',
            status: 'success',
            slug,
            arguments: args,
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

    const ui = yield* TerminalUI;
    const call = yield* prepareExecuteCall(params);

    yield* runConnectedToolkitFailFast(call, params, ui);
    yield* logToolDebug('execute_params', {
      slug: params.slug,
      userId: call.resolvedUserId,
      connectedAccountId: call.selectedConnectedAccountId,
      arguments: call.args,
      projectId: call.resolvedProject.projectId,
      orgId: call.resolvedProject.orgId,
    });
    yield* perfDebugLog('execute.prepare', {
      slug: params.slug,
      surface: params.surface,
      projectMode: params.projectMode,
    });
    yield* runExecuteWithSpinner(call, params, ui);
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
      const batch = yield* readParallelExecuteArgv(tree);
      return yield* runParallelToolsExecute({
        ...batch,
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
