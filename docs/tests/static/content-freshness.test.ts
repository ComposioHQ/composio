import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildContentFreshness, getExplicitLastUpdated, normalizeLastUpdated,
} from '../../lib/content-freshness-build';
import { createPageLastUpdatedReader } from '../../lib/content-freshness';

const directories: string[] = [];
const initial = '2025-01-01T12:00:00+00:00';
const changed = '2025-02-02T12:00:00+00:00';
const unrelated = '2025-03-03T12:00:00+00:00';

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'docs-freshness-'));
  directories.push(directory);
  return directory;
}
function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function put(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function repository() {
  const root = temporaryDirectory();
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Freshness tests');
  git(root, 'config', 'user.email', 'freshness@example.test');
  return root;
}
function commit(root: string, timestamp: string) {
  git(root, 'add', '.');
  execFileSync('git', ['commit', '-m', 'fixture'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp },
  });
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('source-backed page freshness', () => {
  test('tracks a changed source, not unrelated commits or filesystem write time', () => {
    const root = repository();
    put(root, 'content/docs/guide.mdx', 'original');
    put(root, 'unrelated.txt', 'original');
    commit(root, initial);
    put(root, 'content/docs/guide.mdx', 'updated');
    commit(root, changed);
    put(root, 'unrelated.txt', 'updated');
    commit(root, unrelated);
    // Rewriting the same bytes changes filesystem metadata, not source history.
    put(root, 'content/docs/guide.mdx', 'updated');
    const result = buildContentFreshness(root, [
      { pathname: '/docs/guide', sources: ['content/docs/guide.mdx'] },
      { pathname: '/missing', sources: ['content/docs/missing.mdx'] },
    ]);
    expect(result.pages['/docs/guide']).toBe('2025-02-02T12:00:00.000Z');
    expect(result.pages['/missing']).toBeUndefined();
  });

  test('uses real spec, toolkit and KB backing sources and aggregates their latest change', () => {
    const root = repository();
    for (const file of ['public/openapi.json', 'public/data/toolkits.json', 'kb/source/article.md']) {
      put(root, file, 'original');
    }
    commit(root, initial);
    put(root, 'kb/source/article.md', 'updated');
    commit(root, changed);
    const result = buildContentFreshness(root, [
      { pathname: '/reference/operation', sources: ['public/openapi.json'] },
      { pathname: '/toolkits/example', sources: ['public/data/toolkits.json'] },
      { pathname: '/kb/guide/article', sources: ['kb/source/article.md'] },
      { pathname: '/collection', sources: ['public/openapi.json', 'kb/source/article.md'] },
      { pathname: '/unknown-collection', sources: ['kb/source/article.md', 'missing.md'] },
    ]);
    expect(result.pages['/reference/operation']).toBe('2025-01-01T12:00:00.000Z');
    expect(result.pages['/toolkits/example']).toBe('2025-01-01T12:00:00.000Z');
    expect(result.pages['/kb/guide/article']).toBe('2025-02-02T12:00:00.000Z');
    expect(result.pages['/collection']).toBe('2025-02-02T12:00:00.000Z');
    expect(result.pages['/unknown-collection']).toBeUndefined();
  });

  test('honors explicit timestamps without Git and never substitutes release or review dates', () => {
    const root = temporaryDirectory();
    expect(getExplicitLastUpdated('---\ndate: 2025-04-01\nwritten: April 2025\nlastVerifiedAt: 2025-05-01\n---\n')).toBeUndefined();
    const explicit = getExplicitLastUpdated('---\nlast_updated: "2025-04-01T14:30:00+02:00"\n---\n');
    expect(explicit).toBe('2025-04-01T14:30:00+02:00');
    const result = buildContentFreshness(root, [
      { pathname: '/explicit', sources: [], lastUpdated: explicit },
      { pathname: '/unknown', sources: ['missing.mdx'] },
      { pathname: '/date-only', sources: [], lastUpdated: '2025-04-01' },
    ]);
    expect(result.pages['/explicit']).toBe('2025-04-01T12:30:00.000Z');
    expect(result.pages['/date-only']).toBe('2025-04-01T00:00:00.000Z');
    expect(result.pages['/unknown']).toBeUndefined();
    expect(normalizeLastUpdated('2025-02-30')).toBeNull();
    expect(normalizeLastUpdated('2025-04-01T14:30:00')).toBeNull();
    expect(() => getExplicitLastUpdated('---\nlast_updated: nonsense\n---\n')).toThrow('Invalid last_updated');
    expect(() => getExplicitLastUpdated('---\nlast_updated:\ntitle: Example\n---\n')).toThrow('Invalid last_updated');
  });

  test('honors explicit per-source declarations in changelog-style aggregates', () => {
    const root = temporaryDirectory();
    const result = buildContentFreshness(root, [
      { pathname: '/docs/changelog/2025/04/01', sources: ['one.mdx', 'two.mdx'] },
    ], {
      [join(root, 'one.mdx')]: '2025-04-01',
      [join(root, 'two.mdx')]: '2025-04-05',
    });
    expect(result.pages['/docs/changelog/2025/04/01']).toBe('2025-04-05T00:00:00.000Z');
  });

  test('omits shallow-boundary dates while retaining proven changes inside shallow history', () => {
    const original = repository();
    put(original, 'page.mdx', 'original');
    put(original, 'untouched.mdx', 'original');
    commit(original, initial);
    put(original, 'page.mdx', 'updated');
    commit(original, changed);
    put(original, 'other.txt', 'unrelated');
    commit(original, unrelated);
    const shallow = temporaryDirectory();
    git(shallow, 'clone', '--depth=2', pathToFileURL(original).href, '.');
    const definitions = [
      { pathname: '/page', sources: ['page.mdx'] },
      { pathname: '/untouched', sources: ['untouched.mdx'] },
      { pathname: '/other', sources: ['other.txt'] },
    ];
    const result = buildContentFreshness(shallow, definitions);
    expect(result.pages['/page']).toBeUndefined();
    expect(result.pages['/untouched']).toBeUndefined();
    expect(result.pages['/other']).toBe('2025-03-03T12:00:00.000Z');
    git(shallow, 'fetch', '--deepen=1');
    const deeper = buildContentFreshness(shallow, definitions);
    expect(deeper.pages['/page']).toBe('2025-02-02T12:00:00.000Z');
  });

  test('Vercel fetches shallow history before building and stops if the fetch fails', () => {
    const original = repository();
    put(original, 'docs/page.mdx', 'original');
    commit(original, initial);
    put(original, 'unrelated.txt', 'updated');
    commit(original, unrelated);
    const shallow = temporaryDirectory();
    git(shallow, 'clone', '--depth=1', pathToFileURL(original).href, '.');
    const docs = join(shallow, 'docs');
    const definitions = [{ pathname: '/page', sources: ['page.mdx'] }];
    expect(buildContentFreshness(docs, definitions).pages['/page']).toBeUndefined();

    // Replace only the expensive app build; exercise the real Git commands.
    const bin = temporaryDirectory();
    put(bin, 'bun', '#!/bin/sh\nset -eu\ntest "$1" = run\ntest "$2" = build\ngit rev-parse --is-shallow-repository > build-history-state\n');
    chmodSync(join(bin, 'bun'), 0o755);
    const script = fileURLToPath(new URL('../../scripts/vercel-build.sh', import.meta.url));
    const run = () => execFileSync('sh', [script], {
      cwd: docs, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    run();
    expect(readFileSync(join(docs, 'build-history-state'), 'utf8').trim()).toBe('false');
    expect(buildContentFreshness(docs, definitions).pages['/page']).toBe('2025-01-01T12:00:00.000Z');

    // Complete clones do not need a reachable remote.
    git(shallow, 'remote', 'set-url', 'origin', join(original, 'missing'));
    run();

    // A failed fetch must stop before the build can publish unknown dates.
    git(shallow, 'fetch', '--depth=1', pathToFileURL(original).href);
    rmSync(join(docs, 'build-history-state'));
    expect(() => run()).toThrow();
    expect(existsSync(join(docs, 'build-history-state'))).toBe(false);
  });

  test('persists the artifact and serves it after source and Git removal', async () => {
    const root = repository();
    put(root, 'page.mdx', 'original');
    commit(root, initial);
    const manifest = buildContentFreshness(root, [{ pathname: '/page', sources: ['page.mdx'] }]);
    const artifact = join(root, 'content-freshness.json');
    writeFileSync(artifact, JSON.stringify(manifest));
    rmSync(join(root, '.git'), { recursive: true });
    rmSync(join(root, 'page.mdx'));
    const read = createPageLastUpdatedReader(artifact);
    expect(await read('/page')).toBe('2025-01-01T12:00:00.000Z');
    expect(await read('/missing')).toBeNull();
    expect(await read('toString')).toBeNull();
    expect(await createPageLastUpdatedReader(join(root, 'missing.json'))('/page')).toBeNull();
    put(root, 'invalid.json', '{"version":1,"pages":{"/page":"not-a-timestamp"}}');
    expect(await createPageLastUpdatedReader(join(root, 'invalid.json'))('/page')).toBeNull();
  });
});
