import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeBaseSource } from '@/lib/source';

const routeSource = readFileSync(
  join(import.meta.dir, '../../app/(home)/kb/[[...slug]]/page.tsx'),
  'utf8',
);

describe('public KB routes', () => {
  test('loads the generated root, topic, and guide through Fumadocs', () => {
    expect(knowledgeBaseSource.getPage([])?.url).toBe('/kb');
    expect(knowledgeBaseSource.getPage(['sdk-and-api'])?.url).toBe('/kb/sdk-and-api');
    expect(
      knowledgeBaseSource.getPage([
        'sdk-and-api',
        'pagination-limits-are-endpoint-specific',
      ])?.url,
    ).toBe('/kb/sdk-and-api/pagination-limits-are-endpoint-specific');
  });

  test('does not expose held content as a Fumadocs page', () => {
    expect(
      knowledgeBaseSource
        .getPages()
        .some((page) => page.url.includes('auth-config-list-pages-return-at-most-50-items')),
    ).toBe(false);
  });

  test('renders verification metadata and redirects aliases before notFound', () => {
    expect(routeSource).toContain('Last verified');
    expect(routeSource).toContain('resolveKbAlias');
    expect(routeSource.indexOf('permanentRedirect')).toBeLessThan(routeSource.indexOf('notFound()'));
  });
});
