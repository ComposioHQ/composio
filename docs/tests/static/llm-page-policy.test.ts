import { describe, expect, test } from 'bun:test';

import {
  collectDefaultLlmExcludedUrls,
  collectSidebarHiddenLlmUrls,
} from '../../lib/llm-page-policy';

describe('default LLM page policy', () => {
  test('uses page frontmatter instead of navigation labels', () => {
    const excluded = collectDefaultLlmExcludedUrls([
      { url: '/docs/quickstart', data: {} },
      { url: '/docs/old-guide', data: { legacy: true } },
      { url: '/docs/direct-execution', data: { legacy: false } },
    ]);

    expect([...excluded]).toEqual(['/docs/old-guide']);
  });

  test('keeps sidebar-hidden detail pages discoverable unless they are legacy', () => {
    const pages = [
      { url: '/docs/visible', data: {} },
      { url: '/docs/hidden', data: { sidebar: false } },
      { url: '/docs/hidden-legacy', data: { sidebar: false, legacy: true } },
    ];

    expect(collectSidebarHiddenLlmUrls(pages)).toEqual(['/docs/hidden']);
  });
});
