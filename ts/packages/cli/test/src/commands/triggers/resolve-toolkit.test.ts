import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { InternalServerError } from '@composio/client/effect';
import { matchesTriggerListenFilters } from 'src/commands/triggers/filter';
import { parseTriggerListenEvent } from 'src/commands/triggers/parse';
import { makeTriggerToolkitResolver } from 'src/commands/triggers/resolve-toolkit';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { makeLongestPrefixMatcher } from 'src/utils/toolkit-from-tool-slug';
import { countingToolkitsRepository } from 'test/__utils__/services/toolkits-repository-stub';

// `google` and `google_calendar` are both known, so a trigger slug alone cannot
// tell which one `GOOGLE_CALENDAR_EVENT_CREATED` belongs to by splitting it.
const KNOWN_TOOLKITS = ['gmail', 'google', 'google_calendar', 'one_drive'];

const failingFetch = () =>
  Effect.fail(
    new InternalServerError({
      message: 'catalog unavailable',
      method: 'GET',
      url: 'https://backend.composio.dev/api/v3.1/toolkits',
      status: 503,
      requestId: undefined,
      details: undefined,
      body: undefined,
    })
  );

const resolverLayer = () => {
  const repository = countingToolkitsRepository(failingFetch, failingFetch);
  const catalog = Layer.succeed(
    ToolkitSlugCatalog,
    ToolkitSlugCatalog.of({
      local: Effect.succeed({
        slugs: KNOWN_TOOLKITS,
        longestPrefix: makeLongestPrefixMatcher(KNOWN_TOOLKITS),
      }),
      remember: () => Effect.void,
    })
  );
  return { layer: Layer.merge(repository.layer, catalog), calls: repository.calls };
};

const v3Event = (triggerSlug: string) =>
  parseTriggerListenEvent({
    id: 'evt_1',
    type: 'composio.trigger.message',
    metadata: {
      trigger_slug: triggerSlug,
      trigger_id: 'ti_abc',
      connected_account_id: 'ca_abc',
      auth_config_id: 'ac_abc',
      user_id: 'user-1',
    },
    data: {},
  });

const resolveAndFilter = (toolkits: ReadonlyArray<string>, triggerSlug: string) =>
  Effect.gen(function* () {
    const resolve = yield* makeTriggerToolkitResolver();
    const event = yield* resolve(v3Event(triggerSlug));
    return {
      toolkitSlug: event.toolkitSlug,
      matches: matchesTriggerListenFilters({ toolkits }, event),
    };
  }).pipe(Effect.provide(resolverLayer().layer));

describe('makeTriggerToolkitResolver', () => {
  describe('[Given] an event whose trigger slug starts with a longer known toolkit', () => {
    it.effect('[Then] --toolkits google does not match GOOGLE_CALENDAR_EVENT_CREATED', () =>
      Effect.gen(function* () {
        const result = yield* resolveAndFilter(['google'], 'GOOGLE_CALENDAR_EVENT_CREATED');

        expect(result).toEqual({ toolkitSlug: 'google_calendar', matches: false });
      })
    );

    it.effect('[Then] --toolkits google_calendar matches it, case-insensitively', () =>
      Effect.gen(function* () {
        const lower = yield* resolveAndFilter(['google_calendar'], 'GOOGLE_CALENDAR_EVENT_CREATED');
        const upper = yield* resolveAndFilter(['GOOGLE_CALENDAR'], 'GOOGLE_CALENDAR_EVENT_CREATED');

        expect(lower.matches).toBe(true);
        expect(upper.matches).toBe(true);
      })
    );
  });

  // #4947: the first `_` segment of `ONE_DRIVE_FILE_CREATED_TRIGGER` is `ONE`.
  it.effect('[Given] a toolkit slug with an underscore [Then] --toolkits one_drive matches', () =>
    Effect.gen(function* () {
      const result = yield* resolveAndFilter(['one_drive'], 'ONE_DRIVE_FILE_CREATED_TRIGGER');

      expect(result).toEqual({ toolkitSlug: 'one_drive', matches: true });
    })
  );

  it.effect('[Given] a single-word toolkit [Then] --toolkits gmail still matches', () =>
    Effect.gen(function* () {
      const result = yield* resolveAndFilter(['gmail'], 'GMAIL_NEW_GMAIL_MESSAGE');

      expect(result).toEqual({ toolkitSlug: 'gmail', matches: true });
    })
  );

  describe('[Given] a trigger slug no known toolkit prefixes and an unreachable catalog', () => {
    it.effect('[Then] falls back to the first `_` segment', () =>
      Effect.gen(function* () {
        const result = yield* resolveAndFilter(['acme'], 'ACME_WIDGET_CREATED');

        expect(result).toEqual({ toolkitSlug: 'acme', matches: true });
      })
    );

    it.effect('[Then] resolves each distinct trigger slug once', () => {
      const { layer, calls } = resolverLayer();
      return Effect.gen(function* () {
        const resolve = yield* makeTriggerToolkitResolver();
        yield* resolve(v3Event('ACME_WIDGET_CREATED'));
        yield* resolve(v3Event('ACME_WIDGET_CREATED'));

        expect(calls()).toBe(1);
      }).pipe(Effect.provide(layer));
    });
  });

  it.effect('[Given] a payload that names its toolkit [Then] keeps that toolkit', () =>
    Effect.gen(function* () {
      const resolve = yield* makeTriggerToolkitResolver();
      const event = yield* resolve(
        parseTriggerListenEvent({
          appName: 'one_drive',
          metadata: { nanoId: 'ti_abc', triggerName: 'ONE_DRIVE_FILE_CREATED_TRIGGER' },
          payload: {},
        })
      );

      expect(event.toolkitSlug).toBe('one_drive');
    }).pipe(Effect.provide(resolverLayer().layer))
  );
});
