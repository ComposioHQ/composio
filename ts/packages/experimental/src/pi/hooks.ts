import type { MaybePromise, PiHookNext } from './types';

export const runHook = async <TResult, TContext>(
  hook: ((ctx: TContext, next: PiHookNext<TResult>) => MaybePromise<unknown>) | undefined,
  context: TContext,
  getDefaultResult: () => MaybePromise<TResult>
): Promise<TResult | unknown> => {
  if (!hook) return getDefaultResult();

  const state: { nextResult?: Promise<TResult> } = {};
  const next = async (): Promise<TResult> => {
    state.nextResult ??= Promise.resolve(getDefaultResult());
    return state.nextResult;
  };

  const hookValue = await hook(context, next);
  if (hookValue !== undefined) return hookValue;
  return state.nextResult ?? next();
};
