import { Array as Arr, Effect, Option } from 'effect';
import {
  ComposioToolkitsRepository,
  type ToolkitProjectScope,
} from 'src/services/composio-clients';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { isRemoteCustomToolkitSlug } from 'src/utils/remote-custom-toolkit';
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
 * Native matches resolve locally. Custom matches are checked against the
 * active project; unknown slugs also fall through to the catalog, which
 * is what a toolkit released after this binary looks like — or a custom
 * toolkit registered in the current project. Everything else
 * degrades rather than fails: an unreachable catalog still yields the
 * first-underscore guess.
 *
 * Pass the org/project the command resolved as `scope`: custom toolkits are
 * listed per project, and without it the list follows the project context,
 * which in consumer mode is no project at all.
 */
export const toolkitFromToolSlug = (
  toolSlug: string,
  scope?: ToolkitProjectScope
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
    if (match !== undefined && !isRemoteCustomToolkitSlug(match)) {
      return toolkitFromMatchedPrefix(match);
    }

    // Project-scoped custom toolkits are never in the Composio-managed
    // catalog, so a miss asks for both. Either one alone is still worth
    // matching against; only when neither answers does the guess win.
    const repository = yield* ComposioToolkitsRepository;
    const catalogs = yield* Effect.all(
      [repository.getToolkits(), repository.getProjectToolkits(scope)].map(Effect.option),
      { concurrency: 'unbounded' }
    );
    const fetched = Arr.getSomes(catalogs);
    if (!Arr.isReadonlyArrayNonEmpty(fetched)) {
      return matchToolkitFromToolSlug(toolSlug, local.slugs);
    }

    // A successful project lookup is authoritative: machine-wide custom slugs
    // may belong to another project, including longer or shorter prefixes.
    // Retain learned slugs only as a best-effort fallback during an outage.
    const localSlugs = Option.isSome(catalogs[1])
      ? local.slugs.filter(slug => !isRemoteCustomToolkitSlug(slug))
      : local.slugs;
    const allSlugs = [...localSlugs, ...fetched.flat().map(toolkit => toolkit.slug)];

    yield* catalog.remember(allSlugs);

    return matchToolkitFromToolSlug(toolSlug, allSlugs);
  }).pipe(Effect.catch(() => Effect.succeed(guessToolkitFromToolSlug(toolSlug))));
