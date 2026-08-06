import { describe, expect, test } from 'bun:test';

import { collectDefaultLlmExcludedUrls } from '../../lib/llm-page-policy';

describe('default LLM page policy', () => {
  test('uses page frontmatter instead of navigation labels', () => {
    const excluded = collectDefaultLlmExcludedUrls([
      { url: '/docs/quickstart', data: {} },
      { url: '/docs/old-guide', data: { legacy: true } },
      { url: '/docs/direct-execution', data: { legacy: false } },
    ]);

    expect([...excluded]).toEqual(['/docs/old-guide']);
  });
});
