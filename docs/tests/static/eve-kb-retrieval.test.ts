import { describe, expect, test } from 'bun:test';
import { searchDocs } from '../../agent/lib/docs-search';
import { readPageByUrl } from '../../agent/lib/docs';

describe('docs agent knowledge base retrieval', () => {
  test('search_docs returns KB guides and read_doc can open them', () => {
    const { results } = searchDocs('organization API rate limits 429', { limit: 8 });
    const guide = results.find(result => result.url === '/kb/guide/platform-rate-limits');

    expect(guide).toBeDefined();
    expect(guide?.content).toContain('429');
    expect(readPageByUrl('/kb/guide/platform-rate-limits')?.title).toBe('Platform API Rate Limits');
    expect(readPageByUrl('/kb')).toBeDefined();
  });
});
