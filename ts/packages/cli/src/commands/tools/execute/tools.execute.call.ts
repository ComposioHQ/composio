import { Effect, Option } from 'effect';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  refreshConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import {
  ToolInputValidationError,
  validateToolInputArguments,
} from 'src/services/tool-input-validation';
import { ToolsExecutor } from 'src/services/tools-executor';
import { toolkitProjectScope, type PreparedExecuteCall } from './tools.execute.context';
import { perfDebugLog } from './tools.execute.debug';
import type { DryRunSummary } from './tools.execute.format';
import { checkDryRunArguments } from './tools.execute.validation';

export const checkPreparedCallConnection = (
  call: PreparedExecuteCall,
  options: {
    readonly skipConnectionCheck: boolean;
    readonly skipChecks: boolean;
    readonly debug: boolean;
  }
) =>
  Effect.gen(function* () {
    const { slug, resolvedProject, resolvedUserId } = call;
    const debug = options.debug ? perfDebugLog : () => Effect.void;
    if (options.skipChecks || options.skipConnectionCheck) {
      yield* debug('execute.connected_toolkits.skipped', {
        slug,
        reason: options.skipChecks ? 'skip-checks' : 'skip-connection-check',
      });
      return Option.none();
    }
    if (resolvedProject.projectType !== 'CONSUMER') return Option.none();

    const scope = { orgId: resolvedProject.orgId, consumerUserId: resolvedUserId };
    yield* debug('execute.connected_toolkits.refresh_start', { slug, ...scope });
    yield* refreshConsumerConnectedToolkitsCache(scope).pipe(
      Effect.tap(() =>
        debug('execute.connected_toolkits.refresh_end', { slug, ...scope, successful: true })
      ),
      Effect.catch(() =>
        debug('execute.connected_toolkits.refresh_end', { slug, ...scope, successful: false })
      ),
      Effect.forkDetach,
      Effect.asVoid
    );

    const toolkit = yield* toolkitFromToolSlug(slug, toolkitProjectScope(resolvedProject));
    if (!toolkit) return Option.none();

    const cachedToolkits = yield* getFreshConsumerConnectedToolkitsFromCache(scope);
    yield* debug(
      Option.isSome(cachedToolkits)
        ? 'execute.connected_toolkits.cache_hit'
        : 'execute.connected_toolkits.cache_miss',
      {
        slug,
        toolkit,
        ...scope,
        cachedToolkits: Option.getOrUndefined(cachedToolkits),
      }
    );

    if (Option.isSome(cachedToolkits) && !cachedToolkits.value.includes(toolkit)) {
      yield* debug('execute.connected_toolkits.fail_fast', { slug, toolkit, ...scope });
      return Option.some({
        toolkit,
        message: `Toolkit "${toolkit}" is not connected for this user (cached within the last 5 minutes). If you just connected the account, use --skip-connection-check.`,
      });
    }
    return Option.none();
  });

export const previewPreparedCall = (call: PreparedExecuteCall, verificationDisabled: boolean) =>
  Effect.gen(function* () {
    const { slug, args, resolvedProject, resolvedUserId } = call;
    const definition = yield* checkDryRunArguments({
      slug,
      args,
      projectScope: toolkitProjectScope(resolvedProject),
      verificationDisabled,
    });
    return {
      successful: true,
      dryRun: true,
      slug,
      arguments: args,
      userId: resolvedUserId,
      schemaPath: definition?.schemaPath,
      schemaVersion: definition?.version,
    } satisfies DryRunSummary;
  });

export const runPreparedCall = (
  call: PreparedExecuteCall,
  validation: 'skip' | 'best-effort' | 'required'
) =>
  Effect.gen(function* () {
    const { slug, args, resolvedProject, executeParams } = call;
    const executor = yield* ToolsExecutor;
    if (validation !== 'skip') {
      const check = validateToolInputArguments(slug, args, toolkitProjectScope(resolvedProject));
      yield* validation === 'best-effort'
        ? check.pipe(
            Effect.catchIf(
              error => !(error instanceof ToolInputValidationError),
              () => perfDebugLog('execute.validation.schema_unavailable', { slug })
            )
          )
        : check;
    }
    return yield* executor.execute(slug, executeParams);
  });
