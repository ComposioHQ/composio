import { Context, Effect } from 'effect';

/**
 * Captures the given services from the current context, for a layer whose methods provide them
 * later. Only those services: providing the whole context would also replace the caller's
 * `ConfigProvider`.
 */
export const captureServices = <const S extends ReadonlyArray<Context.Key<unknown, unknown>>>(
  ...services: S
) => Effect.map(Effect.context<Context.Service.Identifier<S[number]>>(), Context.pick(...services));
