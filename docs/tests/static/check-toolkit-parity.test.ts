import { describe, expect, test } from 'bun:test';
import {
  countMarkdownTools,
  cacheEntryBytes,
  CACHE_ENTRY_LIMIT,
  findInstantProblems,
  findProblems,
  PAGE_BYTES_BUDGET,
} from '../../scripts/check-toolkit-parity';

const markdown = [
  '# Tableau',
  '',
  '- **Tools:** 436',
  '',
  '## Frequently Asked Questions',
  '',
  '### Does it support OAuth?',
  '',
  '## Tools',
  '',
  '### List Users',
  '',
  '**Slug:** `TABLEAU_LIST_USERS`',
  '',
  '## Pagination',
  '',
  'Use the cursor to retrieve more users.',
  '',
  '### List Views',
  '',
  '**Slug:** `TABLEAU_LIST_VIEWS`',
  '',
  '## Triggers',
  '',
  '### New View',
  '',
  '**Slug:** `TABLEAU_NEW_VIEW_TRIGGER`',
].join('\n');

const healthy = {
  slug: 'tableau',
  snapshotCount: 436,
  productionCount: 436,
  deployedCount: 436,
  largestPageBytes: 1_231_773,
};

describe('countMarkdownTools', () => {
  test('counts tools after a heading in a description and excludes triggers', () => {
    expect(countMarkdownTools(markdown)).toBe(2);
  });

  test('returns 0 for a page without a Tools section', () => {
    expect(countMarkdownTools('# Empty toolkit\n\n## Triggers\n\n**Slug:** `X`')).toBe(0);
  });
});

describe('findProblems', () => {
  test('accepts a page that matches production and the snapshot', () => {
    expect(findProblems(healthy)).toEqual([]);
  });

  test('flags the stale tableau.md listing 10 of 436 tools', () => {
    expect(findProblems({ ...healthy, deployedCount: 10 })).toEqual([
      'tableau.md lists 10 tools; production has 436, the snapshot has 436',
    ]);
  });

  test('accepts a page that still matches a snapshot awaiting its data-sync PR', () => {
    expect(findProblems({ ...healthy, snapshotCount: 10, deployedCount: 10 })).toEqual([]);
  });

  test('flags a snapshot cut off at the API page cap', () => {
    expect(findProblems({ ...healthy, slug: 'microsoft_365', snapshotCount: 1000, productionCount: 1208, deployedCount: 1208 })).toEqual([
      'the microsoft_365 snapshot stops at 1000 of 1208 tools, the API page cap; generate:toolkits did not follow next_cursor',
    ]);
  });

  test('measures the page budget on the base64 cache entry, not the raw body', () => {
    // 1.6 MB raw stays under 2 MiB, but its base64 entry (2.13 MB) does not fit.
    expect(cacheEntryBytes(1_600_000)).toBeGreaterThan(CACHE_ENTRY_LIMIT);
    expect(findProblems({ ...healthy, largestPageBytes: 1_600_000 })).toHaveLength(1);
    expect(cacheEntryBytes(healthy.largestPageBytes)).toBeLessThanOrEqual(PAGE_BYTES_BUDGET);
  });
});

describe('findInstantProblems', () => {
  const instant = { productionSlugs: ['exa', 'tavily'], deployedSlugs: ['tavily', 'exa'], largestPageBytes: 400_000 };

  test('accepts the same slugs in any order', () => {
    expect(findInstantProblems(instant)).toEqual([]);
  });

  test('flags a deployed list frozen before a toolkit gained Instant support', () => {
    expect(findInstantProblems({ ...instant, deployedSlugs: ['exa'] })).toEqual([
      '/api/toolkits/instant lists 1 toolkits; production has 2 (missing: tavily; extra: none)',
    ]);
  });

  test('flags a production /toolkits page whose cache entry is over budget', () => {
    expect(findInstantProblems({ ...instant, largestPageBytes: 1_600_000 })).toHaveLength(1);
  });
});
