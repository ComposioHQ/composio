import { Context, Effect, Option } from 'effect';
import { CommandSurface } from 'src/commands/surface';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { mapComposioError } from 'src/services/composio-error-overrides';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  refreshConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { CLI_DEBUG_FLAG_NAMES } from 'src/services/runtime-flags';
import { normalizeFileUploadSchema } from 'src/services/tool-file-uploads';
import {
  getOrFetchToolInputDefinition,
  validateToolInputArgumentsWithDefinition,
} from 'src/services/tool-input-validation';
import { redact } from 'src/ui/redact';
import {
  resolveExecuteContext,
  resolveSchemaContext,
  toolkitProjectScope,
  type ResolvedExecuteContext,
  type SharedRunToolsExecuteParams,
} from './tools.execute.context';
import {
  invalidArguments,
  ReportedToolExecutionError,
  ToolExecutionError,
} from './tools.execute.errors';
import {
  ciRedactReplacer,
  describeStoredOutputSize,
  executionSuccessSuffix,
  serializeExecuteOutput,
  writeExecuteStdout,
  type DryRunSummary,
} from './tools.execute.format';
import { prepareExecuteOutput } from './tools.execute.output';
import { validateDryRunArguments } from './tools.execute.validation';

export const ExecuteInvocationArgs = Context.Reference<ReadonlyArray<string>>(
  'commands/ExecuteInvocationArgs',
  { defaultValue: () => [] }
);

type ParallelExecuteSpec = {
  readonly slug: string;
  readonly data: Option.Option<string>;
  readonly account: Option.Option<string>;
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

export const parseParallelExecuteArgs = (
  args: ReadonlyArray<string>,
  config: {
    readonly surface: 'root' | 'dev';
    readonly projectMode: 'consumer' | 'developer';
    readonly allowUserId: boolean;
    readonly allowProjectName: boolean;
  }
) =>
  Effect.gen(function* () {
    let getSchema = false;
    let dryRun = false;
    let skipConnectionCheck = false;
    let skipToolParamsCheck = false;
    let skipChecks = false;
    let account = Option.none<string>();
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
        return Effect.succeed({
          value: token.slice(token.indexOf('=') + 1),
          nextIndex: index,
        });
      }

      const next = args[index + 1];
      if (!next) {
        return Effect.fail(invalidArguments(`Missing value for ${token}.`));
      }
      return Effect.succeed({ value: next, nextIndex: index + 1 });
    };

    for (let i = 0; i < args.length; i += 1) {
      const token = args[i];
      if (!token) continue;

      const flagName = token.split('=')[0];
      if (
        CLI_DEBUG_FLAG_NAMES.some(name => flagName === `--${name}` || flagName === `--no-${name}`)
      )
        continue;
      if (flagName === '--log-level') {
        if (!token.includes('=')) i += 1;
        continue;
      }
      // The framework supplies these values; this parser only preserves tool/data grouping.
      if (
        [
          'parallel',
          'get-schema',
          'dry-run',
          'skip-connection-check',
          'skip-tool-params-check',
          'skip-checks',
        ].some(name => flagName === `--${name}` || flagName === `--no-${name}`) &&
        (token !== flagName || flagName.startsWith('--no-'))
      )
        continue;
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
      if (token === '--account' || token.startsWith('--account=')) {
        const parsed = yield* readValue(token, i);
        if (currentSpec) {
          currentSpec = {
            slug: currentSpec.slug,
            data: currentSpec.data,
            account: Option.some(parsed.value),
          };
        } else {
          account = Option.some(parsed.value);
        }
        i = parsed.nextIndex;
        continue;
      }
      if (token === '--user-id' || token.startsWith('--user-id=')) {
        if (!config.allowUserId) {
          return yield* Effect.fail(
            invalidArguments(`${token} is not supported for this execute command.`)
          );
        }
        const parsed = yield* readValue(token, i);
        userId = Option.some(parsed.value);
        i = parsed.nextIndex;
        continue;
      }
      if (token === '--project-name' || token.startsWith('--project-name=')) {
        if (!config.allowProjectName) {
          return yield* Effect.fail(
            invalidArguments(`${token} is not supported for this execute command.`)
          );
        }
        const parsed = yield* readValue(token, i);
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
          return yield* Effect.fail(
            invalidArguments(
              `Expected a tool slug before ${token}. Use: composio execute --parallel TOOL_SLUG -d '{}' TOOL_SLUG_2 -d '{}'.`
            )
          );
        }
        const parsed = yield* readValue(token, i);
        currentSpec = {
          slug: currentSpec.slug,
          data: Option.some(parsed.value),
          account: currentSpec.account,
        };
        i = parsed.nextIndex;
        continue;
      }
      if (token.startsWith('-')) {
        return yield* Effect.fail(
          invalidArguments(`Unknown option for parallel execute: ${token}`)
        );
      }

      pushCurrentSpec();
      currentSpec = {
        slug: token,
        data: Option.none(),
        account,
      };
    }

    pushCurrentSpec();

    if (specs.length === 0) {
      return yield* Effect.fail(
        invalidArguments(
          "No tool slugs were provided. Use: composio execute --parallel TOOL_SLUG -d '{}' TOOL_SLUG_2 -d '{}'."
        )
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
      account,
    } satisfies ParsedParallelExecuteArgs;
  });

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

const runParallelSchemaFetchFromParsed = (params: ParsedParallelExecuteArgs) =>
  Effect.gen(function* () {
    const contexts = yield* Effect.forEach(
      params.specs,
      () =>
        resolveSchemaContext({
          account: params.account,
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
            inputSchema: normalizeFileUploadSchema(definition.schema),
          } satisfies Extract<
            ParallelExecuteResult,
            { readonly inputSchema: Record<string, unknown> }
          >;
        }).pipe(
          Effect.catch(error =>
            toolkitFromToolSlug(spec.slug, toolkitProjectScope(context.resolvedProject)).pipe(
              Effect.map(toolkit => {
                const mapped = mapComposioError({ error, toolkit, toolSlug: spec.slug });
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
          yield* ui.log.error(`[${result.slug}] ${result.error}`);
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

const runParallelToolsExecuteFromParsed = (params: ParsedParallelExecuteArgs) =>
  Effect.gen(function* () {
    if (params.getSchema) {
      return yield* runParallelSchemaFetchFromParsed(params);
    }

    const contexts = yield* Effect.forEach(
      params.specs,
      spec =>
        resolveExecuteContext({
          slug: spec.slug,
          data: spec.data,
          file: Option.none(),
          account: spec.account,
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
              yield* validateDryRunArguments(toolSlug, context.args, definition);
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
                const mapped = mapComposioError({ error, toolkit, toolSlug: spec.slug });
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
            `[${result.slug}] Response stored in ${result.outputFilePath} (${describeStoredOutputSize(result)})`
          );
          continue;
        }

        yield* ui.log.step(
          `[${result.slug}] Execution successful${executionSuccessSuffix(result)}`
        );
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

// Flags that can precede the command name and take the next token as their value
// (`$default.cmd.ts`, `dev.cmd.ts`), so a value equal to the command name is not the command.
const VALUE_FLAGS_BEFORE_COMMAND = new Set([
  '--log-level',
  '--mode',
  '--user-id',
  '--project-name',
]);

/** The index of the command name in argv, skipping a flag value that spells the same word. */
const commandNameIndex = (argv: ReadonlyArray<string>, name: string) =>
  argv.findIndex(
    (token, index) => token === name && !VALUE_FLAGS_BEFORE_COMMAND.has(argv[index - 1] ?? '')
  );

export const runParallelFromCommand = (config: {
  readonly surface: 'root' | 'dev';
  readonly projectMode: 'consumer' | 'developer';
  readonly getSchema: boolean;
  readonly dryRun: boolean;
  readonly skipConnectionCheck: boolean;
  readonly skipToolParamsCheck: boolean;
  readonly skipChecks: boolean;
}) =>
  Effect.gen(function* () {
    const argv = yield* ExecuteInvocationArgs;
    const name = config.surface === 'root' ? 'execute' : 'playground-execute';
    const tail = argv.slice(commandNameIndex(argv, name) + 1);
    const parsed = yield* parseParallelExecuteArgs(tail, {
      ...config,
      allowUserId: config.surface === 'dev',
      allowProjectName: config.surface === 'dev',
    });
    // The tail starts after the command name, so the `dev` group's shared flags given before
    // it reach the command only through the surface.
    const surface = yield* CommandSurface;
    return yield* runParallelToolsExecuteFromParsed({
      ...parsed,
      ...config,
      userId: Option.orElse(parsed.userId, () => surface.userId),
      projectName: Option.orElse(parsed.projectName, () => surface.projectName),
    });
  });
