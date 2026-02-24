import { Composio, ComposioToolExecutionError } from '@composio/core';
import { Context, Effect, Layer, Option } from 'effect';
import type { ToolExecuteParams, ToolExecuteResponse } from '@composio/core';
import { ComposioUserContext } from 'src/services/user-context';
import {
  extractMessage,
  extractSlug,
  extractApiErrorDetails,
} from 'src/utils/api-error-extraction';

export class ActionExecuteConnectedAccountNotFoundError extends Error {
  readonly details: unknown;

  constructor(details: unknown) {
    const message = extractMessage(details) ?? 'No connected account found for this user/toolkit.';
    super(message);
    this.name = 'ActionExecuteConnectedAccountNotFoundError';
    this.details = details;
  }
}

const hasComposioToolExecutionError = (value: unknown): boolean => {
  let current: unknown = value;
  const seen = new Set<unknown>();

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current instanceof ComposioToolExecutionError) {
      return true;
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

  return false;
};

export interface ToolsExecutor {
  readonly execute: (
    slug: string,
    params: ToolExecuteParams
  ) => Effect.Effect<ToolExecuteResponse, unknown>;
}

export const ToolsExecutor = Context.GenericTag<ToolsExecutor>('services/ToolsExecutor');

export const ToolsExecutorLive = Layer.effect(
  ToolsExecutor,
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const apiKey = ctx.data.apiKey.pipe(Option.getOrUndefined);
    const baseURL = ctx.data.baseURL;

    // Lazy: defer Composio SDK initialization until first execute call.
    // The CLI has its own `composio upgrade` command, so skip the npm version check.
    let composio: Composio | undefined;
    const getComposio = () =>
      (composio ??= new Composio({ apiKey, baseURL, disableVersionCheck: true }));

    return ToolsExecutor.of({
      execute: (slug, params) =>
        Effect.tryPromise(() => getComposio().tools.execute(slug, params)).pipe(
          Effect.catchAll((error): Effect.Effect<never, unknown> => {
            const apiDetails = extractApiErrorDetails(error);
            const slugValue = apiDetails?.slug ?? extractSlug(error);
            const shouldWrap =
              slugValue === 'ActionExecute_ConnectedAccountNotFound' &&
              hasComposioToolExecutionError(error);
            if (shouldWrap) {
              return Effect.fail(
                new ActionExecuteConnectedAccountNotFoundError(apiDetails ?? error)
              );
            }
            return Effect.fail(error);
          })
        ),
    });
  })
);
