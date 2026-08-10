import { Effect } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { isMetaToolSlug } from 'src/utils/meta-tool-slugs';
import {
  guessToolkitFromToolSlug,
  matchToolkitFromToolSlug,
} from 'src/utils/toolkit-from-tool-slug';

/**
 * Resolves the toolkit slug for a tool or trigger slug by matching the longest
 * known toolkit slug prefix from the toolkit list (served from the local cache
 * when warm). No string split can find where the toolkit name ends —
 * `GOOGLE_ANALYTICS_RUN_REPORT` belongs to `google_analytics`, not `google` —
 * so the known list is the only reliable source. Falls back to the
 * first-underscore guess when the list cannot be loaded (first run offline,
 * empty cache).
 */
export const toolkitFromToolSlug = (
  toolSlug: string
): Effect.Effect<string | undefined, never, ComposioToolkitsRepository> =>
  Effect.gen(function* () {
    // Meta tools belong to the session rather than to a toolkit, and their
    // slugs shadow real ones — `COMPOSIO_SEARCH_TOOLS` prefix-matches the
    // `composio_search` toolkit, which would send users off to link an app
    // they do not need.
    if (isMetaToolSlug(toolSlug)) {
      return undefined;
    }

    const repository = yield* ComposioToolkitsRepository;
    const toolkits = yield* repository.getToolkits();
    return matchToolkitFromToolSlug(
      toolSlug,
      toolkits.map(toolkit => toolkit.slug)
    );
  }).pipe(Effect.catchAll(() => Effect.succeed(guessToolkitFromToolSlug(toolSlug))));
