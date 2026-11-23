import { Effect, Option } from 'effect';
import { actingUser, CommandSurface } from 'src/commands/surface';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { mapComposioError } from 'src/services/composio-error-overrides';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  refreshConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { normalizeFileUploadSchema } from 'src/services/tool-file-uploads';
import {
  getOrFetchToolInputDefinition,
  validateToolInputArgumentsWithDefinition,
} from 'src/services/tool-input-validation';
import { escapeTerminalLines, escapeTerminalText } from 'src/ui/escape-terminal-text';
import { redact } from 'src/ui/redact';
import {
  resolveExecuteContext,
  resolveSchemaContext,
  toolkitProjectScope,
  type ResolvedExecuteContext,
  type SharedRunToolsExecuteParams,
} from './tools.execute.context';
import { ReportedToolExecutionError, ToolExecutionError } from './tools.execute.errors';
import {
  ciRedactReplacer,
  describeStoredOutputSize,
  executionSuccessSuffix,
  serializeExecuteOutput,
  writeExecuteStdout,
  type DryRunSummary,
} from './tools.execute.format';
import { prepareExecuteOutput } from './tools.execute.output';
import { checkDryRunArguments } from './tools.execute.validation';

export type ParallelExecuteSpec = {
  readonly slug: string;
  readonly data: Option.Option<string>;
  readonly account: Option.Option<string>;
};

/**
 * One `--parallel` batch: its tools in argv order, the batch-wide flags `effect/cli` parsed, and
 * the acting user and project the raw-argv adapter (`tools.execute.parallel-argv.ts`) resolved.
 */
export type ParallelExecuteParams = SharedRunToolsExecuteParams & {
  readonly userId: Option.Option<string>;
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
      Effect.catch(() => Effect.void),
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

    if (Option.isSome(cachedToolkits) && !cachedToolkits.value.includes(toolkit)) {
      return yield* new ToolExecutionError({
        reason: 'connection_check',
        toolSlug: params.slug,
        message: `Toolkit "${toolkit}" is not connected for this user (cached within the last 5 minutes). If you just connected the account, use --skip-connection-check.`,
      });
    }
  });

const runParallelSchemaFetch = (params: ParallelExecuteParams) =>
  Effect.gen(function* () {
    const entries = yield* Effect.forEach(
      params.specs,
      spec =>
        resolveSchemaContext({
          account: params.account,
          projectName: params.projectName,
          surface: params.surface,
          projectMode: params.projectMode,
          getSchema: params.getSchema,
          dryRun: params.dryRun,
          skipConnectionCheck: params.skipConnectionCheck,
          skipToolParamsCheck: params.skipToolParamsCheck,
          skipChecks: params.skipChecks,
        }).pipe(Effect.map(context => ({ spec, context }))),
      { concurrency: 'unbounded' }
    );

    const ui = entries[0]?.context.ui;
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
            inputSchema: normalizeFileUploadSchema(definition.schema),
          } satisfies Extract<
            ParallelExecuteResult,
            { readonly inputSchema: Record<string, unknown> }
          >;
        }).pipe(
          Effect.catch(error =>
            toolkitFromToolSlug(spec.slug, toolkitProjectScope(context.resolvedProject)).pipe(
              Effect.map(toolkit => {
                const mapped = mapComposioError({
                  error,
                  toolkit,
                  toolSlug: spec.slug,
                  tree: params.surface,
                });
                return {
                  slug: spec.slug,
                  successful: false,
                  error: mapped.message,
                } satisfies Extract<ParallelExecuteResult, { readonly successful: false }>;
              })
            )
          )
        ),
      { concurrency: 'unbounded' }
    );

    if (ui) {
      for (const result of results) {
        if (!result.successful) {
          yield* ui.log.error(`[${result.slug}] ${escapeTerminalText(result.error)}`);
          continue;
        }

        yield* ui.log.step(`[${result.slug}] Schema fetched: ${result.schemaPath}`);
      }

      const successful = results.every(result => result.successful);
      yield* ui.log.message(
        `Parallel execute completed: ${results.filter(result => result.successful).length}/${results.length} successful`
      );
      yield* writeExecuteStdout(
        ui,
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
        return yield* new ReportedToolExecutionError({
          reason: 'parallel_failed',
          message: 'One or more parallel tool executions failed.',
        });
      }
    }
  });

const runParallelBatch = (params: ParallelExecuteParams) =>
  Effect.gen(function* () {
    if (params.getSchema) {
      return yield* runParallelSchemaFetch(params);
    }

    // Resolved once, so a test user's notice prints once; each tool still fails on its own
    // input before it fails on a missing user.
    const user = Effect.fromResult(yield* Effect.result(actingUser()));
    const entries = yield* Effect.forEach(
      params.specs,
      spec =>
        resolveExecuteContext(
          {
            slug: spec.slug,
            data: spec.data,
            file: Option.none(),
            account: spec.account,
            projectName: params.projectName,
            surface: params.surface,
            projectMode: params.projectMode,
            getSchema: params.getSchema,
            dryRun: params.dryRun,
            skipConnectionCheck: params.skipConnectionCheck,
            skipToolParamsCheck: params.skipToolParamsCheck,
            skipChecks: params.skipChecks,
          },
          user
        ).pipe(Effect.map(context => ({ spec, context }))),
      { concurrency: 'unbounded' }
    );

    const ui = entries[0]?.context.ui;
    const results = yield* Effect.forEach(
      entries,
      ({ context, spec }) =>
        Effect.gen(function* () {
          const toolSlug = spec.slug;

          yield* checkConnectedToolkitOrFail({
            slug: toolSlug,
            resolvedProject: context.resolvedProject,
            resolvedUserId: context.resolvedUserId,
            skipConnectionCheck: params.skipConnectionCheck,
            skipChecks: params.skipChecks,
          });

          if (params.dryRun) {
            const definition = yield* checkDryRunArguments({
              slug: toolSlug,
              args: context.args,
              projectScope: {
                orgId: context.resolvedProject.orgId,
                projectId: context.resolvedProject.projectId,
              },
              verificationDisabled: params.skipChecks || params.skipToolParamsCheck,
            });
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
            const failed = {
              slug: toolSlug,
              successful: false as const,
              error: result.error ?? 'Execution failed.',
              logId: result.logId,
            };
            if (!result.instantCharge) return failed;
            return { ...failed, instantCharge: result.instantCharge };
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
        }).pipe(
          Effect.catch(error =>
            toolkitFromToolSlug(spec.slug, toolkitProjectScope(context.resolvedProject)).pipe(
              Effect.map(toolkit => {
                const mapped = mapComposioError({
                  error,
                  toolkit,
                  toolSlug: spec.slug,
                  tree: params.surface,
                });
                return {
                  slug: spec.slug,
                  successful: false,
                  error: mapped.message,
                } satisfies ParallelExecuteResult;
              })
            )
          )
        ),
      { concurrency: 'unbounded' }
    );

    if (ui) {
      for (const result of results) {
        if (!result.successful) {
          const logId =
            'logId' in result && typeof result.logId === 'string' && result.logId.length > 0
              ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
              : '';
          yield* ui.log.error(`[${result.slug}] ${escapeTerminalText(`${result.error}${logId}`)}`);
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
            `[${result.slug}] Response stored in ${result.outputFilePath} (${describeStoredOutputSize(result)})`
          );
          continue;
        }

        yield* ui.log.step(
          `[${result.slug}] Execution successful${executionSuccessSuffix(result)}`
        );
        if ('data' in result) {
          yield* ui.note(
            escapeTerminalLines(serializeExecuteOutput(result)),
            `Response: ${result.slug}`
          );
        }
      }
    }

    const successful = results.every(result => result.successful);
    if (ui) {
      yield* ui.log.message(
        `Parallel execute completed: ${results.filter(result => result.successful).length}/${results.length} successful`
      );
      yield* writeExecuteStdout(
        ui,
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
      return yield* new ReportedToolExecutionError({
        reason: 'parallel_failed',
        message: 'One or more parallel tool executions failed.',
      });
    }
  });

/**
 * Runs one `--parallel` batch as its acting user: `actingUser` reads the user and project from
 * the surface, so the batch's own replace the `dev` group's shared flags there.
 */
export const runParallelToolsExecute = (params: ParallelExecuteParams) =>
  Effect.gen(function* () {
    const surface = yield* CommandSurface;
    return yield* runParallelBatch(params).pipe(
      Effect.provideService(
        CommandSurface,
        CommandSurface.of({
          ...surface,
          userId: params.userId,
          projectName: params.projectName,
        })
      )
    );
  });
