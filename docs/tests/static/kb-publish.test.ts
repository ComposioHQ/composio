import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishKbGuide } from '../../scripts/publish-kb-guide';

const roots: string[] = [];
const now = new Date('2026-08-18T00:00:00Z');
const request = {
  action: 'upsert', slug: 'sdk-example', area: 'sdk', title: 'Example',
  description: 'Public example.', body: '## Setup\n\nFollow these steps.',
  topics: ['authentication'], tags: ['old-tag'],
};

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-publish-'));
  roots.push(root);
  mkdirSync(join(root, 'kb/source'), { recursive: true });
  mkdirSync(join(root, 'kb/articles'));
  writeFileSync(join(root, 'kb/manifest.json'), JSON.stringify({
    schemaVersion: 2,
    source: { repository: 'ComposioHQ/support-knowledge', commit: 'initial', capturedAt: '2026-08-18', contentHash: 'sha256:fixture' },
    topics: [{ slug: 'authentication', title: 'Authentication', description: 'Authentication guidance.', featuredRank: 1 }],
    guides: [],
  }));
  return root;
}

function guide(root: string) {
  return JSON.parse(readFileSync(join(root, 'kb/manifest.json'), 'utf8')).guides[0];
}

function contents(root: string): Map<string, string> {
  return new Map(readdirSync(join(root, 'kb'), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const path = join(entry.parentPath, entry.name);
      return [path, readFileSync(path, 'utf8')];
    }));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('approved KB guide publishing', () => {
  test('clears explicit empty tags and retains omitted tags', () => {
    const root = fixture();
    publishKbGuide(request, root, now);
    publishKbGuide({ action: 'upsert', slug: request.slug, body: request.body }, root, now);
    expect(guide(root).tags).toEqual(['old-tag']);
    publishKbGuide({ action: 'upsert', slug: request.slug, body: request.body, tags: [] }, root, now);
    expect(guide(root).tags).toEqual([]);
    expect(guide(root).managedBy).toBe('support-portal');
  });

  test('creates a valid guide with no tags', () => {
    const root = fixture();
    publishKbGuide({ ...request, tags: [] }, root, now);
    expect(guide(root).tags).toEqual([]);
    expect(readFileSync(join(root, 'kb/articles/sdk-example.md'), 'utf8')).toBe(`${request.body}\n`);
  });

  test('rejects explicitly empty topics without writing', () => {
    const root = fixture();
    publishKbGuide(request, root, now);
    const before = contents(root);
    expect(() => publishKbGuide({ ...request, topics: [] }, root, now))
      .toThrow('At least one topic is required');
    expect(contents(root)).toEqual(before);
  });

  test.each([
    ['path traversal', { slug: '../escape' }],
    ['leading hyphen', { slug: '-sdk-example' }],
    ['empty segment', { slug: 'sdk--example' }],
    ['trailing hyphen', { slug: 'sdk-example-' }],
    ['oversized slug', { slug: `${'a'.repeat(60_000)}!` }],
    ['null slug', { slug: null }],
    ['unknown action', { action: 'unsupported' }],
    ['invalid tags', { tags: 'not-an-array' }],
    ['invalid topics', { topics: [123] }],
  ])('rejects %s before changing files', (_label, change) => {
    const root = fixture();
    const before = contents(root);
    expect(() => publishKbGuide({ ...request, ...change }, root, now)).toThrow();
    expect(contents(root)).toEqual(before);
  });

  test('validates staged content before changing an existing guide', () => {
    const root = fixture();
    publishKbGuide(request, root, now);
    const before = contents(root);
    expect(() => publishKbGuide({ ...request, body: 'See T-12345 for details.' }, root, now))
      .toThrow('Plain thread reference');
    expect(contents(root)).toEqual(before);
  });
});
