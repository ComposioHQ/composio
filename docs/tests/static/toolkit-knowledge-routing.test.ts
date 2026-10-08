import { describe, expect, test } from 'bun:test';
import {
  getToolkitKnowledgeHref,
  getToolkitKnowledgeMarkdownHref,
  getToolkitKnowledgeRedirect,
} from '@/lib/knowledge/toolkit-routing';

describe('toolkit knowledge routing', () => {
  test('redirects a single-resource toolkit to its tools reference', () => {
    expect(
      getToolkitKnowledgeRedirect({ slug: 'bitbucket', knowledgeCount: 1 }),
    ).toBe('/toolkits/bitbucket');
  });

  test('keeps multi-resource toolkits on their knowledge page', () => {
    expect(
      getToolkitKnowledgeRedirect({ slug: 'gmail', knowledgeCount: 2 }),
    ).toBeNull();
  });

  test('links toolkit directories directly to the canonical HTML destination', () => {
    expect(getToolkitKnowledgeHref({ slug: 'bitbucket', knowledgeCount: 1 })).toBe(
      '/toolkits/bitbucket',
    );
    expect(getToolkitKnowledgeHref({ slug: 'gmail', knowledgeCount: 2 })).toBe(
      '/kb/toolkit/gmail',
    );
  });

  test('keeps agent-readable toolkit links aligned with their HTML destination', () => {
    expect(
      getToolkitKnowledgeMarkdownHref({ slug: 'bitbucket', knowledgeCount: 1 }),
    ).toBe('/toolkits/bitbucket.md');
    expect(
      getToolkitKnowledgeMarkdownHref({ slug: 'gmail', knowledgeCount: 2 }),
    ).toBe('/kb/toolkit/gmail.md');
  });
});
