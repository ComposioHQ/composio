import type { JsonValue } from 'eve/connections';

/**
 * eve rejects a dynamic tool whose callbacks carry no durable descriptor: each
 * callback must be a JSON-serializable closure plus a function that takes that
 * closure as its first argument, so a parked or replayed call can be rebuilt
 * after the process that resolved it is gone. eve's build transform stamps the
 * descriptor onto `defineTool` calls it finds in the agent's own source, and it
 * never runs on this package inside `node_modules` — so the provider stamps its
 * own descriptors here.
 *
 * The descriptor key is a global-registry symbol, the same identity eve's
 * runtime reads, so no eve internal has to be imported.
 *
 * @module experimental/eve/durable
 */
const DURABLE_CALLBACK = Symbol.for('eve:durable-dynamic-callback');

/** Snapshot persisted alongside a dynamic tool; must stay JSON-serializable. */
export type DurableClosure = Record<string, JsonValue>;

/**
 * Binds `callback` to `closure` and stamps eve's durable descriptor on the
 * result. eve registers the callback under the tool's name at resolve time,
 * persists only `closure`, and calls `callback(closure, ...args)` on replay;
 * direct callers get the ordinary `(...args)` signature.
 */
export function withDurableClosure<
  TClosure extends DurableClosure,
  TArgs extends unknown[],
  TResult,
>(
  closure: TClosure,
  callback: (closure: TClosure, ...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  const live = (...args: TArgs): TResult => callback(closure, ...args);
  Object.defineProperty(live, DURABLE_CALLBACK, {
    configurable: true,
    value: { callback, closure },
  });
  return live;
}
