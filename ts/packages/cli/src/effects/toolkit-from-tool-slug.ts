import { Effect } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { isMetaToolSlug } from 'src/utils/meta-tool-slugs';
import {
  guessToolkitFromToolSlug,
  matchToolkitFromToolSlug,
  toolkitFromMatchedPrefix,
} from 'src/utils/toolkit-from-tool-slug';

/**
 * Resolves the toolkit slug for a tool or trigger slug.
 *
 * No string split can find where the toolkit name ends —
 * `GOOGLE_ANALYTICS_RUN_REPORT` belongs to `google_analytics`, not `google` —
 * so this matches the longest known toolkit slug prefix. "Known" is
 * {@link ToolkitSlugCatalog}: the catalog baked in at build time plus whatever
 * this machine has learned since, both local and memoized per run, so the
 * common case costs no network at all.
 *
 * Only a slug that matches nothing known falls through to the catalog, which
 * is what a toolkit released after this binary looks like. Everything else
 * degrades rather than fails: an unreachable catalog still yields the
 * first-underscore guess.
 */
export const toolkitFromToolSlug = (
  toolSlug: string
): Effect.Effect<string | undefined, never, ComposioToolkitsRepository | ToolkitSlugCatalog> =>
  Effect.gen(function* () {
    // Meta tools belong to the session rather than to a toolkit, and their
    // slugs shadow real ones — `COMPOSIO_SEARCH_TOOLS` prefix-matches the
    // `composio_search` toolkit, which would send users off to link an app
    // they do not need.
    if (isMetaToolSlug(toolSlug)) {
      return undefined;
    }

    const catalog = yield* ToolkitSlugCatalog;
    const local = yield* catalog.local;

    const match = local.longestPrefix(toolSlug);
    if (match !== undefined) {
      return toolkitFromMatchedPrefix(match);
    }

    const repository = yield* ComposioToolkitsRepository;
    const toolkits = yield* repository.getToolkits();
    const allSlugs = [...local.slugs, ...toolkits.map(toolkit => toolkit.slug)];

    yield* catalog.remember(allSlugs);

    return matchToolkitFromToolSlug(toolSlug, allSlugs);
  }).pipe(Effect.catchAll(() => Effect.succeed(guessToolkitFromToolSlug(toolSlug))));
