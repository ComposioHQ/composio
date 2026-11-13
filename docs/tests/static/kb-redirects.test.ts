import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KB_GUIDE_REDIRECTS,
  KB_TOOLKIT_GUIDE_SLUGS,
  KB_TOPIC_REDIRECTS,
  kbRedirects,
} from '@/lib/kb-redirects.mjs';

const root = process.cwd();
const toolkitSlugs = new Set(
  (JSON.parse(readFileSync(join(root, 'public/data/toolkits-list.json'), 'utf8')) as Array<{ slug: string }>)
    .map(toolkit => toolkit.slug),
);

function contentPageExists(pathname: string): boolean {
  return ['.mdx', '.md', '/index.mdx'].some(suffix => existsSync(join(root, 'content', `${pathname}${suffix}`)));
}

describe('retired Knowledge Base redirects', () => {
  test('every mapped guide and topic points at an existing docs page', () => {
    for (const destination of [...Object.values(KB_GUIDE_REDIRECTS), ...Object.values(KB_TOPIC_REDIRECTS)]) {
      expect(contentPageExists(destination), destination).toBe(true);
    }
  });

  test('every renamed toolkit guide points at a published toolkit', () => {
    for (const slug of Object.values(KB_TOOLKIT_GUIDE_SLUGS)) {
      expect(toolkitSlugs.has(slug), slug).toBe(true);
    }
  });

  test('redirects are permanent and end with a catch-all for the rest of /kb', () => {
    const redirects = kbRedirects();
    expect(redirects.every(redirect => redirect.permanent)).toBe(true);
    expect(redirects.at(-1)).toEqual({ source: '/kb/:path*', destination: '/docs', permanent: true });
    const sources = redirects.map(redirect => redirect.source);
    expect(new Set(sources).size).toBe(sources.length);
  });
});
