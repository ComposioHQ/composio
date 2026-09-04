import { DateTime, Duration, Effect, Option, Ref } from 'effect';
import { BAKED_TOOLKIT_SLUGS } from 'src/generated/toolkit-slugs';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import {
  readKnownToolkitSlugs,
  writeKnownToolkitSlugs,
  type KnownToolkitSlugs,
} from 'src/services/known-toolkit-slugs';
import { makeLongestPrefixMatcher } from 'src/utils/toolkit-from-tool-slug';

/**
 * How long learned slugs are trusted before a background refresh is started.
 * Only relevant for toolkits released after the last refresh: a slug already
 * known is never wrong, so this bounds how long a *new* toolkit can be
 * mistaken for a shorter one that shares its prefix (a hypothetical
 * `google_analytics_v2` resolving as `google_analytics`).
 */
const REFRESH_AFTER = Duration.days(7);

/**
 * A successful run ends by event-loop drain rather than an explicit exit, so a
 * daemon fiber mid-fetch holds the finished command open until the network
 * answers. This bounds that lingering; an interrupted refresh costs a fetch on
 * a later run, nothing more.
 */
const REFRESH_TIMEOUT = Duration.seconds(10);

const learnedSlugs = (learned: Option.Option<KnownToolkitSlugs>): ReadonlyArray<string> =>
  Option.match(learned, {
    onNone: () => [],
    onSome: known => known.slugs,
  });

/**
 * Re-reads the catalog and records it, in the background. Failures are
 * swallowed: a refresh that does not happen costs a fetch later, nothing more.
 */
const refreshKnownToolkitSlugs = Effect.gen(function* () {
  const repository = yield* ComposioToolkitsRepository;
  const toolkits = yield* repository.getToolkits();
  yield* writeKnownToolkitSlugs([...BAKED_TOOLKIT_SLUGS, ...toolkits.map(t => t.slug)]);
}).pipe(Effect.timeout(REFRESH_TIMEOUT), Effect.ignore);

/**
 * Starts a refresh when the learned slugs are missing or older than
 * {@link REFRESH_AFTER}. A `refreshedAt` in the future (a clock that jumped)
 * counts as fresh — the point is to bound staleness, not to police clocks.
 */
const refreshInBackgroundIfStale = (learned: Option.Option<KnownToolkitSlugs>) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const isFresh = Option.match(learned, {
      onNone: () => false,
      onSome: known =>
        Duration.lessThan(
          Duration.millis(DateTime.distance(known.refreshedAt, now)),
          REFRESH_AFTER
        ),
    });

    if (isFresh) return;

    yield* Effect.forkDaemon(refreshKnownToolkitSlugs);
  });

/**
 * The toolkit slugs a run can match against without asking the API: the
 * catalog baked in at build time plus whatever this machine has learned since.
 */
export interface LocalToolkitSlugs {
  readonly slugs: ReadonlyArray<string>;
  /**
   * Longest-prefix match over {@link slugs}. Returns the matched toolkit slug,
   * or undefined when nothing local matches — which is what a toolkit released
   * after this binary looks like.
   */
  readonly longestPrefix: (toolSlug: string) => string | undefined;
}

const loadLocalToolkitSlugs = Effect.gen(function* () {
  const learned = yield* readKnownToolkitSlugs;
  const slugs = [...BAKED_TOOLKIT_SLUGS, ...learnedSlugs(learned)];

  yield* refreshInBackgroundIfStale(learned);

  return { slugs, longestPrefix: makeLongestPrefixMatcher(slugs) } satisfies LocalToolkitSlugs;
});

/**
 * Owns the local half of toolkit resolution, resolved once per process.
 *
 * Reading it costs a file read, a JSON parse, a schema decode, and a lookup set
 * over a thousand-odd slugs — cheap next to the catalog fetch it replaces, but
 * a single `composio execute` resolves a toolkit four times over (bootstrap
 * telemetry, the execute context, the connection check, the execution itself),
 * and `--parallel` multiplies that by the number of tools. None of it can
 * change under a running process, so `Effect.cached` memoizes it for the
 * lifetime of the layer: the first caller pays, the rest await the same result.
 *
 * Memoizing also gates the staleness refresh to one fork per run, where an
 * unmemoized read forked — and rewrote the file — once per resolution.
 */
export class ToolkitSlugCatalog extends Effect.Service<ToolkitSlugCatalog>()(
  'services/ToolkitSlugCatalog',
  {
    effect: Effect.gen(function* () {
      const local = yield* Effect.cached(loadLocalToolkitSlugs);
      const hasRecorded = yield* Ref.make(false);

      /**
       * Records slugs learned from a catalog fetch, in the background, at most
       * once per run. Every miss in a run merges the same memoized fetch into
       * the same local list, so later calls would fork a daemon fiber only to
       * rewrite an identical file — and each pending fiber holds the finished
       * command open a little longer.
       */
      const remember = (slugs: ReadonlyArray<string>): Effect.Effect<void> =>
        Effect.gen(function* () {
          const alreadyRecorded = yield* Ref.getAndSet(hasRecorded, true);
          if (alreadyRecorded) return;
          yield* Effect.forkDaemon(writeKnownToolkitSlugs(slugs));
        });

      return { local, remember };
    }),
  }
) {}
