import { Effect, Option } from 'effect';
import { actingUser, CommandSurface } from 'src/commands/surface';
import { normalizeFileUploadSchema } from 'src/services/tool-file-uploads';
import { TerminalUI } from 'src/services/terminal-ui';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import { escapeTerminalLines, escapeTerminalText } from 'src/ui/escape-terminal-text';
import { redact } from 'src/ui/redact';
import {
  checkPreparedCallConnection,
  previewPreparedCall,
  runPreparedCall,
} from './tools.execute.call';
import {
  prepareExecuteCall,
  resolveExecuteSchemaProject,
  toolkitProjectScope,
  type RunToolsExecuteParams,
} from './tools.execute.context';
import { ReportedToolExecutionError, ToolExecutionError } from './tools.execute.errors';
import { inspectExecuteFailure } from './tools.execute.failure';
import {
  ciRedactReplacer,
  describeStoredOutputSize,
  executionSuccessSuffix,
  serializeExecuteOutput,
  writeExecuteStdout,
} from './tools.execute.format';
import { prepareExecuteOutput } from './tools.execute.output';

export type ParallelExecuteSpec = {
  readonly slug: string;
  readonly data: Option.Option<string>;
  readonly account: Option.Option<string>;
};

/**
 * One `--parallel` batch: its tools in argv order, the batch-wide flags `effect/cli` parsed, and
 * the acting user and project the raw-argv adapter (`tools.execute.parallel-argv.ts`) resolved.
 */
export type ParallelExecuteParams = Omit<
  RunToolsExecuteParams,
  'slug' | 'data' | 'file' | 'account'
> & {
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

const runParallelSchemaFetch = (params: ParallelExecuteParams) =>
  Effect.gen(function* () {
    const entries = yield* Effect.forEach(
      params.specs,
      spec => resolveExecuteSchemaProject(params).pipe(Effect.map(project => ({ spec, project }))),
      { concurrency: 'unbounded' }
    );

    const ui = yield* TerminalUI;
    const results = yield* Effect.forEach(
      entries,
      ({ project, spec }) =>
        Effect.gen(function* () {
          const definition = yield* getOrFetchToolInputDefinition(spec.slug, {
            orgId: project.orgId,
            projectId: project.projectId,
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
            inspectExecuteFailure(error, {
              toolSlug: spec.slug,
              surface: params.surface,
              projectScope: toolkitProjectScope(project),
            }).pipe(
              Effect.map(
                failure =>
                  ({
                    slug: spec.slug,
                    successful: false,
                    error: failure.mapped.message,
                  }) satisfies Extract<ParallelExecuteResult, { readonly successful: false }>
              )
            )
          )
        ),
      { concurrency: 'unbounded' }
    );

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
  });

const runParallelBatch = (params: ParallelExecuteParams) =>
  Effect.gen(function* () {
    if (params.getSchema) {
      return yield* runParallelSchemaFetch(params);
    }

    // Resolved once, so a test user's notice prints once; each tool still fails on its own
    // input before it fails on a missing user.
    const user = Effect.fromResult(yield* Effect.result(actingUser()));
    // A failed preparation aborts the batch before any tool is sent.
    const calls = yield* Effect.forEach(
      params.specs,
      spec => prepareExecuteCall({ ...spec, file: Option.none(), surface: params.surface }, user),
      { concurrency: 'unbounded' }
    );

    const ui = yield* TerminalUI;
    const verificationDisabled = params.skipChecks || params.skipToolParamsCheck;
    const results = yield* Effect.forEach(
      calls,
      call =>
        Effect.gen(function* () {
          const missing = yield* checkPreparedCallConnection(call, {
            skipConnectionCheck: params.skipConnectionCheck,
            skipChecks: params.skipChecks,
            debug: false,
          });
          if (Option.isSome(missing)) {
            return yield* new ToolExecutionError({
              reason: 'connection_check',
              toolSlug: call.slug,
              message: missing.value.message,
            });
          }

          if (params.dryRun) {
            return yield* previewPreparedCall(call, verificationDisabled);
          }

          const result = yield* runPreparedCall(call, verificationDisabled ? 'skip' : 'required');
          if (!result.successful) {
            const failed = {
              slug: call.slug,
              successful: false as const,
              error: result.error ?? 'Execution failed.',
              logId: result.logId,
            };
            if (!result.instantCharge) return failed;
            return { ...failed, instantCharge: result.instantCharge };
          }

          const output = yield* prepareExecuteOutput(call.slug, result, call.executeOutputDir);
          if (output.kind === 'file') {
            return {
              slug: call.slug,
              ...output.summary,
            };
          }

          return {
            slug: call.slug,
            ...result,
          };
        }).pipe(
          Effect.catch(error =>
            inspectExecuteFailure(error, {
              toolSlug: call.slug,
              surface: params.surface,
              projectScope: toolkitProjectScope(call.resolvedProject),
            }).pipe(
              Effect.map(
                failure =>
                  ({
                    slug: call.slug,
                    successful: false,
                    error: failure.mapped.message,
                  }) satisfies ParallelExecuteResult
              )
            )
          )
        ),
      { concurrency: 'unbounded' }
    );

    for (const result of results) {
      if (!result.successful) {
        const logId =
          'logId' in result && typeof result.logId === 'string' && result.logId.length > 0
            ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
            : '';
        yield* ui.log.error(`[${result.slug}] ${escapeTerminalText(`${result.error}${logId}`)}`);
        continue;
      }

      if ('dryRun' in result) {
        yield* ui.log.step(`[${result.slug}] Dry run successful`);
        continue;
      }

      if ('storedInFile' in result && result.storedInFile) {
        yield* ui.log.step(
          `[${result.slug}] Response stored in ${result.outputFilePath} (${describeStoredOutputSize(result)})`
        );
        continue;
      }

      yield* ui.log.step(`[${result.slug}] Execution successful${executionSuccessSuffix(result)}`);
      if ('data' in result) {
        yield* ui.note(
          escapeTerminalLines(serializeExecuteOutput(result)),
          `Response: ${result.slug}`
        );
      }
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
