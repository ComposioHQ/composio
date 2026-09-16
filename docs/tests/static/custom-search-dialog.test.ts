import { describe, expect, test } from 'bun:test';
import * as customSearchDialogModule from '@/components/custom-search-dialog';

describe('global search result analytics metadata', () => {
  test('skips hits that do not have a navigable URL', () => {
    const buildAlgoliaHitMetadata = (
      customSearchDialogModule as {
        buildAlgoliaHitMetadata?: (
          hits: Array<{ objectID: string; url?: string }>,
          queryID?: string,
        ) => Map<string, { objectID: string; position: number; queryID?: string }>;
      }
    ).buildAlgoliaHitMetadata;

    expect(typeof buildAlgoliaHitMetadata).toBe('function');
    if (!buildAlgoliaHitMetadata) return;

    const metadata = buildAlgoliaHitMetadata([
      { objectID: 'missing-url' },
      { objectID: 'docs', url: '/docs' },
    ], 'query-id');

    expect([...metadata.entries()]).toEqual([[
      '/docs',
      { objectID: 'docs', position: 2, queryID: 'query-id' },
    ]]);
  });
});
