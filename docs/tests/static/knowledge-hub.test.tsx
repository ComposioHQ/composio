import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgeHub } from '@/components/kb/knowledge-hub';
import {
  getKnowledgeSearchHref,
  KnowledgeSearchForm,
} from '@/components/kb/knowledge-search-form';
import { SourceBadge } from '@/components/kb/source-badge';

function source(path: string): string {
  return readFileSync(join(import.meta.dir, '../..', path), 'utf8');
}

describe('knowledge hub', () => {
  test('renders a search-first landing page with curated recovery paths', () => {
    const html = renderToStaticMarkup(<KnowledgeHub />);

    expect(html).toContain('Search all Composio knowledge');
    expect(html).toContain('Search product docs and support answers');
    expect(html.match(/href="\/kb\/topic\//g)).toHaveLength(6);
    expect(html).toContain('Browse by toolkit');
    expect(html).toContain('View all toolkits');
    expect(html).toContain('Featured answers and guides');
    for (const label of [
      'Docs', 'Knowledge Base', 'OAuth', 'Toolkits', 'Examples', 'Reference', 'Changelog',
    ]) {
      expect(html).toContain(label);
    }
  });

  test('builds a shareable search URL and exposes a visible search label', () => {
    expect(getKnowledgeSearchHref('oauth github', 'all'))
      .toBe('/kb/search?q=oauth+github&filter=all');
    const html = renderToStaticMarkup(<KnowledgeSearchForm defaultQuery="oauth github" />);

    expect(html).toContain('<label');
    expect(html).toContain('Search product docs and support answers');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="filter"');
    expect(html).toContain('focus-visible:ring-2');
  });

  test('renders readable source badges rather than color-only markers', () => {
    const html = renderToStaticMarkup(<SourceBadge sourceType="kb" />);
    expect(html).toContain('Knowledge Base');
  });

  test('implements accessible result, empty, and failure states', () => {
    const resultsSource = source('components/kb/knowledge-search-results.tsx');

    expect(resultsSource).toContain('aria-live="polite"');
    expect(resultsSource).toContain('aria-current');
    expect(resultsSource).toContain('No results for');
    expect(resultsSource).toContain('Browse product areas');
    expect(resultsSource).toContain('Browse toolkits');
    expect(resultsSource).toContain('Search is temporarily unavailable');
    expect(resultsSource).toContain('lastVerifiedAt');
    expect(resultsSource).toContain('<SourceBadge');
  });

  test('removes the generated Fumadocs tree from the KB layout', () => {
    const layoutSource = source('app/(home)/kb/layout.tsx');
    expect(layoutSource).not.toContain('createDocsLayout');
    expect(layoutSource).not.toContain('knowledgeBaseSource.pageTree');
  });
});
