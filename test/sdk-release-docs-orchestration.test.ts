import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitDocsPatch, docsInputSchema } from '../scripts/sdk-release/docs';
import { GitHubReleaseClient } from '../scripts/sdk-release/github';
import { batchPath, type ReleaseBatch } from '../scripts/sdk-release/source';

const source = 'a'.repeat(40);
const pending = 'b'.repeat(40);
const released = 'c'.repeat(40);
const created = 'd'.repeat(40);
const moved = 'e'.repeat(40);
const guide = 'docs/content/docs/guide.mdx';
const maintenanceBranch = 'docs/auto-sdk-sync';
const batch: ReleaseBatch = {
  schemaVersion: 1,
  id: '8',
  originalRunId: '8',
  inputBase: source,
  statusUrl: 'https://github.com/ComposioHQ/composio/issues/8',
  date: '2026-11-03',
  outputs: [],
  plan: {
    schemaVersion: 1,
    inputFingerprint: 'frozen',
    choices: { typescript: 'auto', python: 'skip' },
    recommended: [],
    releases: [
      {
        name: '@composio/core',
        type: 'patch',
        oldVersion: '1.0.0',
        newVersion: '1.0.1',
        changesets: [],
        language: 'typescript',
      },
    ],
    changesets: [],
    retainedChangesets: [],
  },
};

function docsInput(sourceSha = source, branchHead = pending, before: string | null = 'Current\n') {
  return docsInputSchema.parse({
    runId: 51,
    batch,
    sourceSha,
    verifiedRunId: 51,
    verifiedSourceSha: released,
    branchHead,
    pendingFiles: [{ path: guide, before, after: 'Pending\n' }],
    targets: { '@composio/core': '1.0.1' },
    verifiedLanguages: ['typescript'],
    summaries: [],
  });
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

async function prepareFixture(current: string | null, pendingText: string) {
  const cwd = await mkdtemp(join(tmpdir(), 'sdk-docs-prepare-'));
  roots.push(cwd);
  git(cwd, 'init', '--initial-branch=next');
  git(cwd, 'config', 'user.name', 'SDK release fixture');
  git(cwd, 'config', 'user.email', 'sdk-release@example.invalid');
  await mkdir(join(cwd, 'docs/content/docs'), { recursive: true });
  await writeFile(join(cwd, guide), 'Introduction\n\nOriginal first\n\nOriginal last\n');
  await writeFile(
    join(cwd, 'docs/package.json'),
    JSON.stringify({ dependencies: { '@composio/core': '^1.0.0' } })
  );
  await writeFile(
    join(cwd, 'docs/bun.lock'),
    JSON.stringify({ packages: { '@composio/core': ['@composio/core@1.0.0'] } })
  );
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'Initial guides');
  git(cwd, 'checkout', '-b', maintenanceBranch);
  await writeFile(join(cwd, guide), pendingText);
  git(cwd, 'commit', '-am', 'Pending guide edits');
  const branchHead = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'checkout', 'next');
  if (current === null) await rm(join(cwd, guide));
  else await writeFile(join(cwd, guide), current);
  git(cwd, 'commit', '-am', 'Current protected guide edits');
  const sourceSha = git(cwd, 'rev-parse', 'HEAD');
  const inputPath = join(cwd, 'input.json');
  const input = docsInput(sourceSha, branchHead, current);
  input.pendingFiles[0].after = pendingText;
  await writeFile(inputPath, JSON.stringify(input));
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../scripts/sdk-release/docs.ts', import.meta.url)), 'prepare'],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        SDK_DOCS_INPUT: inputPath,
        SDK_RELEASE_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
      },
    }
  );
  return { cwd, result, sourceSha };
}

describe('docs prepare public CLI', () => {
  test('three-way merging preserves separate protected and pending guide edits', async () => {
    const { cwd, result, sourceSha } = await prepareFixture(
      'Introduction\n\nProtected first\n\nOriginal last\n',
      'Introduction\n\nOriginal first\n\nPending last\n'
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(await readFile(join(cwd, guide), 'utf8')).toBe(
      'Introduction\n\nProtected first\n\nPending last\n'
    );
    expect(await Bun.file(join(cwd, 'docs/package.json')).json()).toEqual({
      dependencies: { '@composio/core': '1.0.1' },
    });
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(sourceSha);
  });

  test('overlapping guide edits fail without replacing the protected content', async () => {
    const current = 'Introduction\n\nProtected first\n\nOriginal last\n';
    const { cwd, result } = await prepareFixture(
      current,
      'Introduction\n\nPending first\n\nOriginal last\n'
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Pending guide edits conflict with current protected docs');
    expect(await readFile(join(cwd, guide), 'utf8')).toBe(current);
    expect(git(cwd, 'status', '--porcelain', '--', 'docs')).toBe('');
  });

  test('pending edits cannot resurrect a guide deleted on protected next', async () => {
    const { cwd, result } = await prepareFixture(
      null,
      'Introduction\n\nPending first\n\nOriginal last\n'
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Pending guide edits conflict with a newer protected deletion');
    expect(await Bun.file(join(cwd, guide)).exists()).toBe(false);
    expect(git(cwd, 'status', '--porcelain', '--', 'docs')).toBe('');
  });
});

function commitFixture(movement?: 'next' | 'pending') {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let wroteCommit = false;
  const run = {
    id: 51,
    path: '.github/workflows/sdk.release.yml',
    head_branch: 'sdk-release/8',
    head_sha: released,
    event: 'push',
    repository: { full_name: 'ComposioHQ/composio' },
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-11-03T00:00:00Z',
    run_attempt: 1,
    html_url: 'https://github.com/ComposioHQ/composio/actions/runs/51',
  };
  const github = new GitHubReleaseClient('fixture-token', async (url, init) => {
    const { pathname, search, origin } = new URL(String(url));
    if (origin !== 'https://api.github.com') throw new Error('Unexpected API origin');
    const path = `${pathname}${search}`.replace('/repos/ComposioHQ/composio', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const respond = (value: unknown) => Response.json(value);
    const currentSource = wroteCommit && movement === 'next' ? moved : source;
    const currentPending = wroteCommit && movement === 'pending' ? moved : pending;
    if (method === 'GET') {
      if (path === '/actions/runs/51') return respond(run);
      if (path === '/actions/runs/51/jobs?filter=all&per_page=100&page=1')
        return respond({ jobs: [{ name: 'Verify public SDK packages', conclusion: 'success' }] });
      if (path === '/actions/workflows/sdk.release.yml/runs?event=push&per_page=100&page=1')
        return respond({ workflow_runs: [run] });
      if (path === '/git/ref/tags/sdk-release/8')
        return respond({ object: { type: 'commit', sha: released } });
      if (path === '/git/ref/heads/next') return respond({ object: { sha: currentSource } });
      if (path === `/git/ref/heads/${maintenanceBranch}`)
        return respond({ object: { sha: currentPending } });
      if (path === `/compare/${currentSource}...${currentPending}`)
        return respond({ files: [{ filename: guide }] });
      if (path === `/git/trees/${released}?recursive=1`)
        return respond({
          truncated: false,
          tree: [{ path: 'ts/packages/core/package.json', type: 'blob' }],
        });
      if (path === `/git/commits/${source}`) return respond({ tree: { sha: 'f'.repeat(40) } });
      if (path === `/pulls?state=open&base=next&head=ComposioHQ:${maintenanceBranch}`)
        return respond([]);
      const contentPath = pathname.split('/contents/')[1];
      if (contentPath) {
        const ref = new URL(String(url)).searchParams.get('ref');
        const content =
          contentPath === batchPath && ref === released
            ? JSON.stringify(batch)
            : contentPath === 'ts/packages/core/package.json' && ref === released
              ? JSON.stringify({ name: '@composio/core', version: '1.0.1' })
              : contentPath === guide && ref === currentSource
                ? 'Current\n'
                : contentPath === guide && ref === currentPending
                  ? 'Pending\n'
                  : undefined;
        if (content !== undefined)
          return respond({ encoding: 'base64', content: Buffer.from(content).toString('base64') });
      }
    }
    if (method === 'POST' && path === '/git/trees') return respond({ sha: '1'.repeat(40) });
    if (method === 'POST' && path === '/git/commits') {
      wroteCommit = true;
      return respond({ sha: created });
    }
    if (method === 'PATCH' && path === `/git/refs/heads/${maintenanceBranch}`)
      return respond({ object: { sha: created } });
    if (method === 'POST' && path === '/pulls') return respond({ number: 9 });
    throw new Error(`Unexpected GitHub fixture request: ${method} ${path}`);
  });
  const patch = {
    input: docsInput(),
    files: [{ path: guide, before: 'Current\n', after: 'Merged guide\n' }],
  };
  return { github, patch, calls };
}

describe('docs commit controller', () => {
  for (const movement of ['next', 'pending'] as const) {
    test(`${movement} movement during commit preparation prevents a branch update`, async () => {
      const { github, patch, calls } = commitFixture(movement);
      await expect(commitDocsPatch(github, patch)).rejects.toThrow(
        'Protected docs, verified release or pending guide edits changed'
      );
      expect(
        calls.filter(call => call.method === 'POST' && call.path === '/git/commits')
      ).toHaveLength(1);
      expect(calls.filter(call => call.path === '/git/ref/heads/next')).toHaveLength(2);
      expect(
        calls.filter(call => call.path === `/git/ref/heads/${maintenanceBranch}`)
      ).toHaveLength(2);
      expect(
        calls.filter(call => call.method !== 'GET' && call.path.startsWith('/git/refs'))
      ).toHaveLength(0);
      expect(
        calls.filter(call => call.method !== 'GET' && call.path.startsWith('/pulls'))
      ).toHaveLength(0);
    });
  }

  test('unchanged inputs update the existing branch without force and create one PR', async () => {
    const { github, patch, calls } = commitFixture();
    expect(await commitDocsPatch(github, patch)).toEqual({ changed: true });
    expect(calls.filter(call => call.path === `/git/refs/heads/${maintenanceBranch}`)).toEqual([
      {
        method: 'PATCH',
        path: `/git/refs/heads/${maintenanceBranch}`,
        body: { sha: created, force: false },
      },
    ]);
    const prs = calls.filter(call => call.method === 'POST' && call.path === '/pulls');
    expect(prs).toHaveLength(1);
    expect(prs[0].body).toMatchObject({ head: maintenanceBranch, base: 'next' });
    expect(
      calls.find(call => call.method === 'POST' && call.path === '/git/commits')?.body
    ).toMatchObject({
      parents: [source, pending],
    });
  });
});
