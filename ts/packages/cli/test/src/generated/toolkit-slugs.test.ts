import { describe, expect, it } from 'vitest';
import { BAKED_TOOLKIT_SLUGS, BAKED_TOOLKIT_SLUGS_REFRESHED_AT } from 'src/generated/toolkit-slugs';
import { TOOLKIT_SLUG_PATTERN } from 'src/models/toolkits';

/**
 * Guards the checked-in output of `scripts/generate-toolkit-slugs.ts`. The
 * resolver reads this list on every tool execution, so a hand-edit or a bad
 * regeneration is a correctness problem, not a cosmetic one. Nothing here
 * touches the network — the point is that the CLI does not have to either.
 */
describe('BAKED_TOOLKIT_SLUGS', () => {
  it('holds the whole catalog', () => {
    expect(BAKED_TOOLKIT_SLUGS.length).toBeGreaterThanOrEqual(1000);
  });

  it('is sorted and free of duplicates', () => {
    expect([...BAKED_TOOLKIT_SLUGS]).toEqual([...new Set(BAKED_TOOLKIT_SLUGS)].sort());
  });

  it('holds only lowercase slugs', () => {
    const malformed = BAKED_TOOLKIT_SLUGS.filter(slug => !TOOLKIT_SLUG_PATTERN.test(slug));
    expect(malformed).toEqual([]);
  });

  it('includes staple toolkits', () => {
    expect(BAKED_TOOLKIT_SLUGS).toContain('github');
    expect(BAKED_TOOLKIT_SLUGS).toContain('gmail');
    // The multi-word slug behind https://github.com/ComposioHQ/composio/issues/4049.
    expect(BAKED_TOOLKIT_SLUGS).toContain('google_analytics');
  });

  it('records when it was generated', () => {
    expect(new Date(BAKED_TOOLKIT_SLUGS_REFRESHED_AT).toISOString()).toBe(
      BAKED_TOOLKIT_SLUGS_REFRESHED_AT
    );
  });
});
