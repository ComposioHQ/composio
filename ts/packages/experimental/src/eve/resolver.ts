import { defineDynamic, type DynamicResolveContext } from 'eve/tools';
import type { EveToolCollection } from './provider';

type EveSession = { tools: () => Promise<EveToolCollection> };
type EveSessionSource<S extends EveSession> =
  S | Promise<S> | ((context: DynamicResolveContext) => S | Promise<S>);

// step.started keeps the provider's live execute closures (session.started
// snapshots them away); cached per resolved session since session.tools() is a
// network call. Rejected requests are evicted so transient failures can retry.
export function defineComposioTools<S extends EveSession>(source: EveSessionSource<S>) {
  const cache = new WeakMap<S, Promise<EveToolCollection>>();

  const resolveTools = async (context: DynamicResolveContext): Promise<EveToolCollection> => {
    const session = await (typeof source === 'function' ? source(context) : source);
    const cached = cache.get(session);
    if (cached) return cached;

    const pending = session.tools();
    cache.set(session, pending);
    try {
      return await pending;
    } catch (error) {
      if (cache.get(session) === pending) cache.delete(session);
      throw error;
    }
  };

  return defineDynamic({
    events: {
      'step.started': (_event, context) => resolveTools(context),
    },
  });
}
