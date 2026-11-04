import { afterEach, describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { DocsInput, commitDocsPatch, newestVerifiedRelease } from '../scripts/sdk-release/docs';
import { run, spawn, withoutReleaseTokens } from '../scripts/sdk-release/runtime';
import { BATCH_PATH, type ReleaseBatch } from '../scripts/sdk-release/source';
import {
  exists,
  readText,
  remove,
  runRelease,
  temporaryDirectories,
  writeText,
  type Fetch,
} from './sdk-release-harness';

const source = 'a'.repeat(40);
const pending = 'b'.repeat(40);
const released = 'c'.repeat(40);
const created = 'd'.repeat(40);
const moved = 'e'.repeat(40);
const guide = 'docs/content/docs/guide.mdx';
const maintenanceBranch = 'docs/auto-sdk-sync';
const app = { id: 123, slug: 'sdk-release' };
const batch: ReleaseBatch = {
  schemaVersion: 1,
  id: '8',
  originalRunId: '8',
  requestedBy: ['requester'],
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

function docsInput(
  sourceSha = source,
  branchHead = pending,
  before: string | null = 'Current\n',
  after = 'Pending\n'
) {
  return Schema.decodeUnknownSync(DocsInput)({
    runId: 51,
    batch,
    sourceSha,
    verifiedRunId: 51,
    verifiedSourceSha: released,
    branchHead,
    pendingFiles: [{ path: guide, before, after }],
    targets: { '@composio/core': '1.0.1' },
    verifiedLanguages: ['typescript'],
    summaries: [],
  });
}

const roots = temporaryDirectories('sdk-docs-prepare-');
afterEach(() => roots.cleanup());

const git = async (cwd: string, ...args: string[]) =>
  (await runRelease(run('git', args, { cwd }))).trim();
const docsCli = decodeURIComponent(
  new URL('../scripts/sdk-release/docs.ts', import.meta.url).pathname
);

async function prepareFixture(current: string | null, pendingText: string) {
  const cwd = await roots.create();
  await git(cwd, 'init', '--initial-branch=next');
  await git(cwd, 'config', 'user.name', 'SDK release fixture');
  await git(cwd, 'config', 'user.email', 'sdk-release@example.invalid');
  await writeText(`${cwd}/${guide}`, 'Introduction\n\nOriginal first\n\nOriginal last\n');
  await writeText(
    `${cwd}/docs/package.json`,
    JSON.stringify({ dependencies: { '@composio/core': '^1.0.0' } })
  );
  await writeText(
    `${cwd}/docs/bun.lock`,
    JSON.stringify({ packages: { '@composio/core': ['@composio/core@1.0.0'] } })
  );
  await git(cwd, 'add', '.');
  await git(cwd, 'commit', '-m', 'Initial guides');
  await git(cwd, 'checkout', '-b', maintenanceBranch);
  await writeText(`${cwd}/${guide}`, pendingText);
  await git(cwd, 'commit', '-am', 'Pending guide edits');
  const branchHead = await git(cwd, 'rev-parse', 'HEAD');
  await git(cwd, 'checkout', 'next');
  if (current === null) await remove(`${cwd}/${guide}`);
  else await writeText(`${cwd}/${guide}`, current);
  await git(cwd, 'commit', '-am', 'Current protected guide edits');
  const sourceSha = await git(cwd, 'rev-parse', 'HEAD');
  const inputPath = `${cwd}/input.json`;
  await writeText(
    inputPath,
    JSON.stringify(docsInput(sourceSha, branchHead, current, pendingText))
  );
  const result = await runRelease(
    spawn(process.execPath, [docsCli, 'prepare'], {
      cwd,
      env: { SDK_DOCS_INPUT: inputPath, ...withoutReleaseTokens },
    })
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
    expect(Number(result.exitCode)).toBe(0);
    expect(await readText(`${cwd}/${guide}`)).toBe(
      'Introduction\n\nProtected first\n\nPending last\n'
    );
    expect(JSON.parse(await readText(`${cwd}/docs/package.json`))).toEqual({
      dependencies: { '@composio/core': '1.0.1' },
    });
    expect(await git(cwd, 'rev-parse', 'HEAD')).toBe(sourceSha);
  });

  test('overlapping guide edits fail without replacing the protected content', async () => {
    const current = 'Introduction\n\nProtected first\n\nOriginal last\n';
    const { cwd, result } = await prepareFixture(
      current,
      'Introduction\n\nPending first\n\nOriginal last\n'
    );
    expect(Number(result.exitCode)).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Pending guide edits conflict with current protected docs'
    );
    expect(await readText(`${cwd}/${guide}`)).toBe(current);
    expect(await git(cwd, 'status', '--porcelain', '--', 'docs')).toBe('');
  });

  test('pending edits cannot resurrect a guide deleted on protected next', async () => {
    const { cwd, result } = await prepareFixture(
      null,
      'Introduction\n\nPending first\n\nOriginal last\n'
    );
    expect(Number(result.exitCode)).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Pending guide edits conflict with a newer protected deletion'
    );
    expect(await exists(`${cwd}/${guide}`)).toBe(false);
    expect(await git(cwd, 'status', '--porcelain', '--', 'docs')).toBe('');
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
    actor: { login: 'sdk-release[bot]', type: 'Bot' },
    repository: { full_name: 'ComposioHQ/composio' },
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-11-03T00:00:00Z',
    run_attempt: 1,
    html_url: 'https://github.com/ComposioHQ/composio/actions/runs/51',
  };
  const github: Fetch = async (url, init) => {
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
      if (path === '/apps/sdk-release') return respond(app);
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
          contentPath === BATCH_PATH && ref === released
            ? JSON.stringify(batch)
            : contentPath === 'ts/packages/core/package.json' && ref === released
              ? JSON.stringify({ name: '@composio/core', version: '1.0.1' })
              : contentPath === guide && ref === currentSource
                ? 'Current\n'
                : contentPath === guide && ref === currentPending
                  ? 'Pending\n'
                  : undefined;
        if (content !== undefined)
          return respond({ encoding: 'base64', content: Base64.encode(content) });
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
  };
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
      await expect(runRelease(commitDocsPatch(patch, app), github)).rejects.toThrow(
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
    expect(await runRelease(commitDocsPatch(patch, app), github)).toEqual({ changed: true });
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

interface TagRunFixture {
  readonly id: number;
  readonly actor?: string;
  readonly verified?: boolean;
}

/** Tag runs newest first; each run's tag points at its own commit. */
function tagRunsFixture(runs: ReadonlyArray<TagRunFixture>) {
  const shaOf = (id: number) => String(id % 10).repeat(40);
  const github: Fetch = async url => {
    const { pathname, search } = new URL(String(url));
    const path = `${pathname}${search}`.replace('/repos/ComposioHQ/composio', '');
    if (path === '/apps/sdk-release') return Response.json(app);
    if (path === '/actions/workflows/sdk.release.yml/runs?event=push&per_page=100&page=1')
      return Response.json({
        workflow_runs: runs.map(run => ({
          id: run.id,
          path: '.github/workflows/sdk.release.yml',
          head_branch: `sdk-release/${run.id}`,
          head_sha: shaOf(run.id),
          event: 'push',
          actor: { login: run.actor ?? 'sdk-release[bot]', type: 'Bot' },
          repository: { full_name: 'ComposioHQ/composio' },
          status: 'completed',
          conclusion: run.verified === false ? 'failure' : 'success',
          created_at: '2026-11-03T00:00:00Z',
          run_attempt: 1,
          html_url: `https://github.com/ComposioHQ/composio/actions/runs/${run.id}`,
        })),
      });
    const tag = /^\/git\/ref\/tags\/sdk-release\/(\d+)$/.exec(path);
    if (tag) return Response.json({ object: { type: 'commit', sha: shaOf(Number(tag[1])) } });
    const jobs = /^\/actions\/runs\/(\d+)\/jobs\?/.exec(path);
    if (jobs) {
      const run = runs.find(candidate => candidate.id === Number(jobs[1]));
      return Response.json({
        jobs: [
          {
            name: 'Verify public SDK packages',
            conclusion: run?.verified === false ? 'failure' : 'success',
          },
        ],
      });
    }
    const content = /^\/contents\/(.+)\?ref=([a-f0-9]{40})$/.exec(path);
    if (content?.[1] === BATCH_PATH) {
      const run = runs.find(candidate => shaOf(candidate.id) === content[2]);
      return Response.json({
        encoding: 'base64',
        content: Base64.encode(JSON.stringify({ ...batch, id: String(run?.id) })),
      });
    }
    throw new Error(`Unexpected GitHub fixture request: ${path}`);
  };
  return github;
}

describe('docs maintenance release selection', () => {
  test('picks the newest verified tag run and skips a newer one whose verification failed', async () => {
    const github = tagRunsFixture([{ id: 53, verified: false }, { id: 51 }]);
    const latest = await runRelease(newestVerifiedRelease(app), github);
    expect(latest.run.id).toBe(51);
    expect(latest.batch.id).toBe('51');
  });

  test('ignores a verified-looking tag run pushed by an actor other than the release App', async () => {
    const github = tagRunsFixture([{ id: 52, actor: 'mallory' }, { id: 51 }]);
    expect((await runRelease(newestVerifiedRelease(app), github)).run.id).toBe(51);
  });
});

describe('docs maintenance workflow', () => {
  test('a failed release docs run reports once on the request issue with the docs run link', async () => {
    const workflow = Bun.YAML.parse(
      await Bun.file('.github/workflows/docs.sdk-change-sync.yml').text()
    ) as {
      jobs: Record<
        string,
        {
          needs?: string[];
          if?: string;
          permissions?: Record<string, string>;
          outputs?: Record<string, string>;
          steps?: { run?: string; env?: Record<string, string> }[];
        }
      >;
    };
    expect(workflow.jobs['sdk-context'].outputs?.['request-issue']).toBe(
      '${{ steps.context.outputs.request-issue }}'
    );
    const report = workflow.jobs['sdk-report-failure'];
    expect(report.needs).toEqual([
      'sdk-context',
      'sdk-maintenance',
      'sdk-maintenance-pr',
      'sdk-deploy',
      'sdk-live',
    ]);
    expect(report.if).toContain('failure()');
    expect(report.if).toContain("needs.sdk-context.outputs.request-issue != ''");
    expect(report.if).toContain("needs.sdk-live.result != 'failure'");
    expect(report.permissions).toEqual({ issues: 'write' });
    const steps = report.steps ?? [];
    expect(steps).toHaveLength(1);
    expect(steps[0].env).toMatchObject({
      GH_TOKEN: '${{ github.token }}',
      ISSUE: '${{ needs.sdk-context.outputs.request-issue }}',
    });
    expect(steps[0].run).toContain('gh issue comment "$ISSUE"');
    expect(steps[0].run).toContain('were not deployed or checked');
    expect(steps[0].run).toContain('$GITHUB_RUN_ID');
  });
});
