import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import type { Toolkits } from 'src/models/toolkits';
import { TestLive } from 'test/__utils__';
import { makeToolkitFixture } from 'test/__utils__/models/toolkits';

const testToolkits: Toolkits = [
  makeToolkitFixture('google', 'Google'),
  makeToolkitFixture('google_analytics', 'Google Analytics'),
  makeToolkitFixture('gmail', 'Gmail'),
  makeToolkitFixture('microsoft', 'Microsoft'),
  makeToolkitFixture('microsoft_teams', 'Microsoft Teams'),
  // A real, linkable toolkit whose slug is also the prefix of a session meta
  // tool (`COMPOSIO_SEARCH_TOOLS`).
  makeToolkitFixture('composio_search', 'Composio Search'),
];

describe('toolkitFromToolSlug', () => {
  layer(TestLive({ toolkitsData: { toolkits: testToolkits } }))('with known toolkits', it => {
    it.effect('resolves multi-word toolkit slugs by longest known prefix', () =>
      Effect.gen(function* () {
        expect(yield* toolkitFromToolSlug('GOOGLE_ANALYTICS_RUN_REPORT')).toBe('google_analytics');
        expect(yield* toolkitFromToolSlug('MICROSOFT_TEAMS_SEND_MESSAGE')).toBe('microsoft_teams');
      })
    );

    it.effect('resolves single-word toolkit slugs', () =>
      Effect.gen(function* () {
        expect(yield* toolkitFromToolSlug('GMAIL_SEND_EMAIL')).toBe('gmail');
      })
    );

    it.effect('falls back to the guess for slugs outside the known list', () =>
      Effect.gen(function* () {
        expect(yield* toolkitFromToolSlug('NOTION_CREATE_PAGE')).toBe('notion');
      })
    );

    it.effect('gives meta tools no toolkit, even when one shadows their slug', () =>
      Effect.gen(function* () {
        // Attributing this to `composio_search` would make a failed meta call
        // tell the user to link an app that has nothing to do with it.
        expect(yield* toolkitFromToolSlug('COMPOSIO_SEARCH_TOOLS')).toBeUndefined();
        expect(yield* toolkitFromToolSlug('COMPOSIO_MANAGE_CONNECTIONS')).toBeUndefined();
      })
    );

    it.effect('still resolves ordinary tools of the shadowed toolkit', () =>
      Effect.gen(function* () {
        expect(yield* toolkitFromToolSlug('COMPOSIO_SEARCH_SEARCH')).toBe('composio_search');
      })
    );
  });

  layer(TestLive())('with an empty toolkit list', it => {
    it.effect('falls back to the first-underscore guess', () =>
      Effect.gen(function* () {
        expect(yield* toolkitFromToolSlug('GOOGLE_ANALYTICS_RUN_REPORT')).toBe('google');
      })
    );
  });
});
