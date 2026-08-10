import process from 'node:process';
import path from 'node:path';
import { $ } from 'bun';
import {
  Config,
  ConfigProvider,
  Console,
  Data,
  DateTime,
  Effect,
  Layer,
  Logger,
  Option,
  Schema,
} from 'effect';
import { FileSystem } from '@effect/platform';
import { BunContext, BunFileSystem, BunRuntime } from '@effect/platform-bun';
import { TOOLKIT_SLUG_PATTERN } from 'src/models/toolkits';
import { teardown } from './_teardown';

/**
 * Usage: `pnpm --filter @composio/cli generate:toolkit-slugs`.
 *
 * Refreshes `src/generated/toolkit-slugs.ts` — the toolkit slugs the CLI knows
 * about without asking the API. Resolving a tool slug to its toolkit needs the
 * catalog (`GOOGLE_ANALYTICS_RUN_REPORT` belongs to `google_analytics`, not
 * `google`), and downloading ~800 KB of toolkit metadata to learn ~11 KB of
 * slugs is most of the wall time of a `composio execute`.
 *
 * Authentication, in order of preference:
 * - `COMPOSIO_USER_API_KEY` (+ `COMPOSIO_ORG_ID`) — a `uak_` key, what a
 *   logged-in developer has locally.
 * - `COMPOSIO_API_KEY` — a project-scoped key, what CI has.
 *
 * `COMPOSIO_BASE_URL` overrides the API host; it defaults to production
 * because the baked list ships to users of the production catalog.
 */

const PRODUCTION_BASE_URL = 'https://backend.composio.dev';
const PAGE_SIZE = 1000;

/** Slugs the catalog cannot plausibly be missing. */
const SENTINEL_SLUGS = ['github', 'gmail', 'google_analytics'] as const;

/**
 * A catalog this small means we are looking at a partial or wrong response —
 * an empty page, a filtered org view, an error body that happened to decode.
 * Today's production catalog holds ~1070 toolkits and the backend never
 * removes one, so anything below this is a bad fetch, not a shrunken catalog.
 */
const MIN_EXPECTED_SLUGS = 1000;

const ToolkitsPage = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      // `native` toolkits are the shared catalog. Anything else (an org-scoped
      // custom toolkit, say) is not knowledge we can bake into a released
      // binary for everyone.
      type: Schema.optional(Schema.String),
    })
  ),
  next_cursor: Schema.NullishOr(Schema.String),
});

class ToolkitFetchError extends Data.TaggedError('ToolkitFetchError')<{
  readonly message: string;
}> {}

const authHeaders = Effect.gen(function* () {
  const userApiKey = yield* Config.option(Config.string('COMPOSIO_USER_API_KEY'));
  const orgId = yield* Config.option(Config.string('COMPOSIO_ORG_ID'));
  const apiKey = yield* Config.option(Config.string('COMPOSIO_API_KEY'));

  if (Option.isSome(userApiKey)) {
    return {
      'x-user-api-key': userApiKey.value,
      ...(Option.isSome(orgId) ? { 'x-org-id': orgId.value } : {}),
    };
  }

  if (Option.isSome(apiKey)) {
    return { 'x-api-key': apiKey.value };
  }

  return yield* new ToolkitFetchError({
    message: 'Set COMPOSIO_API_KEY, or COMPOSIO_USER_API_KEY (+ COMPOSIO_ORG_ID), and retry.',
  });
});

const fetchPage = (params: { baseUrl: string; headers: Record<string, string>; cursor?: string }) =>
  Effect.gen(function* () {
    const url = new URL('/api/v3/toolkits', params.baseUrl);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (params.cursor) {
      url.searchParams.set('cursor', params.cursor);
    }

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers: params.headers }),
      catch: cause => new ToolkitFetchError({ message: `GET ${url.pathname} failed: ${cause}` }),
    });

    if (!response.ok) {
      const body = yield* Effect.promise(() => response.text());
      return yield* new ToolkitFetchError({
        message: `GET ${url.pathname} returned ${response.status}: ${body.slice(0, 400)}`,
      });
    }

    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: cause => new ToolkitFetchError({ message: `Response was not JSON: ${cause}` }),
    });

    return yield* Schema.decodeUnknown(ToolkitsPage)(payload).pipe(
      Effect.mapError(cause => new ToolkitFetchError({ message: `Unexpected response: ${cause}` }))
    );
  });

/** Walks the cursor to the end of the catalog. */
const fetchAllSlugs = (params: { baseUrl: string; headers: Record<string, string> }) =>
  Effect.gen(function* () {
    const slugs: string[] = [];
    let cursor: string | undefined = undefined;
    let page = 0;

    do {
      const result = yield* fetchPage({ ...params, cursor });
      page += 1;

      for (const toolkit of result.items) {
        if (toolkit.type === undefined || toolkit.type === 'native') {
          slugs.push(toolkit.slug.toLowerCase());
        }
      }

      yield* Effect.logInfo(`Page ${page}: ${result.items.length} toolkits (${slugs.length} kept)`);
      cursor = result.next_cursor ?? undefined;
    } while (cursor);

    return [...new Set(slugs)].sort();
  });

/**
 * Refuses to overwrite a good list with a bad fetch. Every failure mode we can
 * cheaply detect — truncated pagination, an org-scoped view, a decoded error
 * body — shows up as too few slugs, malformed slugs, or missing staples.
 */
const checkSanity = (slugs: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    if (slugs.length < MIN_EXPECTED_SLUGS) {
      return yield* new ToolkitFetchError({
        message: `Refusing to write ${slugs.length} slugs; expected at least ${MIN_EXPECTED_SLUGS}.`,
      });
    }

    const malformed = slugs.filter(slug => !TOOLKIT_SLUG_PATTERN.test(slug));
    if (malformed.length > 0) {
      return yield* new ToolkitFetchError({
        message: `Refusing to write malformed slugs: ${malformed.slice(0, 10).join(', ')}`,
      });
    }

    const missing = SENTINEL_SLUGS.filter(sentinel => !slugs.includes(sentinel));
    if (missing.length > 0) {
      return yield* new ToolkitFetchError({
        message: `Refusing to write a catalog without ${missing.join(', ')}.`,
      });
    }
  });

const renderModule = (params: { slugs: ReadonlyArray<string>; refreshedAt: string }) =>
  `// Generated by scripts/generate-toolkit-slugs.ts — do not edit by hand.
// Refresh: pnpm --filter @composio/cli generate:toolkit-slugs

/**
 * Toolkit slugs known at build time, sorted. Resolving a tool slug to its
 * toolkit is a longest-prefix match against the known catalog, and this list
 * answers that without a network call. Toolkits released after this snapshot
 * are picked up at runtime; the backend never removes a toolkit, so an entry
 * here never goes stale in the other direction.
 */
export const BAKED_TOOLKIT_SLUGS: ReadonlyArray<string> = [
${params.slugs.map(slug => `  '${slug}',`).join('\n')}
];

/** When the list above was generated. */
export const BAKED_TOOLKIT_SLUGS_REFRESHED_AT = '${params.refreshedAt}';
`;

export function generateToolkitSlugs() {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const baseUrl = yield* Config.string('COMPOSIO_BASE_URL').pipe(
      Config.withDefault(PRODUCTION_BASE_URL)
    );
    const headers = yield* authHeaders;

    yield* Effect.logInfo(`Fetching the toolkit catalog from ${baseUrl}`);
    const slugs = yield* fetchAllSlugs({ baseUrl, headers });
    yield* checkSanity(slugs);

    const refreshedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
    const outputPath = path.join(process.cwd(), 'src', 'generated', 'toolkit-slugs.ts');

    yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
    yield* fs.writeFileString(outputPath, renderModule({ slugs, refreshedAt }));
    yield* Effect.promise(() => $`pnpm exec prettier --write ${outputPath}`.quiet());

    yield* Console.log(`Wrote ${slugs.length} toolkit slugs to ${outputPath}`);
  });
}

if (require.main === module) {
  generateToolkitSlugs().pipe(
    Effect.provide(Logger.pretty),
    Effect.provide(BunContext.layer),
    Effect.provide(BunFileSystem.layer),
    Effect.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())),
    Effect.scoped,
    BunRuntime.runMain({ teardown })
  );
}
