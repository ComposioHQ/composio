import { defineDynamic } from "eve/tools";
import type { EveToolCollection } from "./provider.js";

type EveSession = { tools: () => Promise<EveToolCollection> };

// step.started keeps the provider's live execute closures (session.started
// snapshots them away); cached since session.tools() is a network call.
export function defineComposioTools<S extends EveSession>(session: S | Promise<S>) {
  let cache: Promise<EveToolCollection> | undefined;
  return defineDynamic({
    events: {
      "step.started": () => (cache ??= Promise.resolve(session).then((s) => s.tools())),
    },
  });
}
