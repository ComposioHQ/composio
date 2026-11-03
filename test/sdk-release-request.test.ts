import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitHubReleaseClient, type ReleaseFetch } from '../scripts/sdk-release/github';
import { executePilotRequest, parseReleaseRequest } from '../scripts/sdk-release/request';
import { createPilotPlan } from '../scripts/sdk-release/preview';

const temporary: string[] = [];
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'sdk-release-request-'));
  temporary.push(cwd);
  const file = async (path: string, value: string) => {
    await mkdir(join(cwd, path, '..'), { recursive: true });
    await writeFile(join(cwd, path), value);
  };
  await file(
    'package.json',
    JSON.stringify({ name: 'pilot-fixture', private: true, workspaces: ['packages/*'] })
  );
  await file('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  await file(
    'packages/core/package.json',
    JSON.stringify({ name: '@composio/core', version: '0.28.0' })
  );
  await file(
    'packages/slim/package.json',
    JSON.stringify({ name: '@composio/slim', version: '0.28.0' })
  );
  await file(
    '.changeset/config.json',
    JSON.stringify({
      changelog: false,
      fixed: [['@composio/core', '@composio/slim']],
      linked: [],
      access: 'public',
      baseBranch: 'next',
      updateInternalDependencies: 'patch',
      ignore: [],
    })
  );
  await file(
    '.changeset/python-note.md',
    '---\n"@composio/python-sdk": patch\n---\n\nFix account updates.\n'
  );
  await file('python/pyproject.toml', '[project]\nname = "composio"\nversion = "0.31.0"\n');
  await file('python/composio/__version__.py', '__version__ = "0.31.0"\n');
  return cwd;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

function issueBody(
  typescript = 'auto',
  python = 'minor',
  action = 'preview',
  runId = '_No response_'
) {
  return `### Action\n\n${action}\n\n### TypeScript\n\n${typescript}\n\n### Python\n\n${python}\n\n### Original run ID\n\n${runId}\n`;
}

function apiFixture(
  options: {
    membership?: 'active' | 'pending' | 'absent' | 'error';
    active?: boolean;
    run?: Record<string, unknown>;
    failFirstPull?: boolean;
    tamperTree?: boolean;
  } = {}
) {
  const writes: { path: string; body: unknown }[] = [];
  const reads: string[] = [];
  let branchCreated = false;
  let pullFailed = false;
  let planContents = '';

  const fetcher: ReleaseFetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (method !== 'GET') {
      writes.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path.endsWith('/git/trees')) {
        const body = writes.at(-1)?.body;
        planContents = JSON.stringify(body);
        return json({ sha: 'b'.repeat(40) });
      }
      if (path.endsWith('/git/commits')) return json({ sha: 'c'.repeat(40) });
      if (path.endsWith('/git/refs')) {
        branchCreated = true;
        return json({ ref: 'refs/heads/sdk-release/preview-123' });
      }
      if (path.endsWith('/pulls') && options.failFirstPull && !pullFailed) {
        pullFailed = true;
        return json({ message: 'Unavailable' }, 503);
      }
      if (path.endsWith('/issues/77/comments')) return json({ id: 1 });
      if (path.endsWith('/pulls'))
        return json({
          number: 91,
          html_url: 'https://github.com/ComposioHQ/composio/pull/91',
          draft: true,
          body: '<!-- sdk-release-preview -->',
          head: { ref: 'sdk-release/preview-123', repo: { full_name: 'ComposioHQ/composio' } },
        });
      if (path.endsWith('/rerun-failed-jobs')) return new Response(null, { status: 201 });
      throw new Error(`Unexpected write ${method} ${path}`);
    }
    reads.push(path);
    if (path.startsWith('/orgs/ComposioHQ/memberships/')) {
      if (options.membership === 'absent') return json({ message: 'Not Found' }, 404);
      if (options.membership === 'error') return json({ message: 'Unavailable' }, 503);
      return json({ state: options.membership ?? 'active' });
    }
    if (path.endsWith('/pulls'))
      return json(
        options.active
          ? [
              {
                number: 90,
                html_url: 'https://github.com/ComposioHQ/composio/pull/90',
                draft: true,
                body: '<!-- sdk-release-preview -->',
                head: {
                  ref: 'sdk-release/preview-120',
                  repo: { full_name: 'ComposioHQ/composio' },
                },
              },
            ]
          : []
      );
    if (path.includes('/compare/'))
      return json({
        files: [
          { filename: '.github/sdk-release-previews/123.json', status: 'added' },
          ...(options.tamperTree
            ? [{ filename: 'python/composio/client.py', status: 'modified' }]
            : []),
        ],
      });
    if (path.includes('/git/ref/heads/'))
      return branchCreated
        ? json({ object: { sha: 'c'.repeat(40) } })
        : json({ message: 'Not Found' }, 404);
    if (path.includes('/contents/')) {
      const body = JSON.parse(planContents);
      return json({
        encoding: 'base64',
        content: Buffer.from(body.tree[0].content).toString('base64'),
      });
    }
    if (path.includes('/git/commits/'))
      return json({
        sha: path.endsWith('c'.repeat(40)) ? 'c'.repeat(40) : 'a'.repeat(40),
        tree: { sha: 'd'.repeat(40) },
        parents: [{ sha: 'a'.repeat(40) }],
      });
    if (path.includes('/actions/runs/'))
      return json({
        id: 120,
        path: '.github/workflows/sdk.release.yml',
        head_branch: 'next',
        repository: { full_name: 'ComposioHQ/composio' },
        status: 'completed',
        conclusion: 'failure',
        created_at: new Date().toISOString(),
        run_attempt: 1,
        html_url: 'https://github.com/ComposioHQ/composio/actions/runs/120',
        ...options.run,
      });
    throw new Error(`Unexpected read ${path}`);
  };
  return { client: new GitHubReleaseClient('token', fetcher), writes, reads };
}

const context = { actor: 'private-member', runId: '123', sourceSha: 'a'.repeat(40) };
const emptyPlan = {
  schemaVersion: 1 as const,
  inputFingerprint: 'fixture',
  choices: { typescript: 'auto' as const, python: 'auto' as const },
  recommended: [],
  releases: [],
  changesets: [],
  retainedChangesets: [],
};

describe('guarded SDK release pilot', () => {
  test('issue form and writer dispatch normalize through the same schema', () => {
    expect(parseReleaseRequest('issues', { issue: { body: issueBody() } })).toEqual(
      parseReleaseRequest('workflow_dispatch', { inputs: { python: 'minor' } })
    );
    expect(() =>
      parseReleaseRequest('workflow_dispatch', { inputs: { python: 'minor; echo stolen' } })
    ).toThrow();
    expect(() =>
      parseReleaseRequest('issues', {
        issue: { body: issueBody('auto', 'minor', 'retry', '../../120') },
      })
    ).toThrow();
  });

  for (const membership of ['pending', 'absent', 'error'] as const) {
    test(`${membership} membership fails before planning or any release write`, async () => {
      const { client, writes } = apiFixture({ membership });
      let planned = false;
      await expect(
        executePilotRequest(
          client,
          parseReleaseRequest('workflow_dispatch', { inputs: {} }),
          { ...context, issueNumber: 77 },
          async () => {
            planned = true;
            return emptyPlan;
          }
        )
      ).rejects.toThrow();
      expect(planned).toBe(false);
      expect(writes).toEqual([]);
    });
  }

  test('a private-membership read-only member gets a draft plan-only PR and existing requests return its status', async () => {
    const { client, writes } = apiFixture();
    const plan = {
      ...emptyPlan,
      releases: [
        {
          name: '@composio/python-sdk',
          language: 'python' as const,
          oldVersion: '0.31.0',
          newVersion: '0.31.1',
          type: 'patch' as const,
          changesets: ['python-note'],
        },
      ],
    };
    const result = await executePilotRequest(
      client,
      parseReleaseRequest('workflow_dispatch', { inputs: {} }),
      context,
      async () => plan
    );
    expect(result.state).toBe('preview');
    expect(result.pullRequest).toBe('https://github.com/ComposioHQ/composio/pull/91');
    const tree = writes.find(write => write.path.endsWith('/git/trees'))?.body;
    expect(tree).toMatchObject({ tree: [{ path: '.github/sdk-release-previews/123.json' }] });
    expect(
      writes
        .map(write => write.path)
        .some(
          path => path.includes('/merge') || path.includes('/tags') || path.includes('/releases')
        )
    ).toBe(false);
    expect(JSON.stringify(tree)).not.toMatch(/package\.json|pyproject\.toml|CHANGELOG/);
    const existing = apiFixture({ active: true });
    const status = await executePilotRequest(
      existing.client,
      parseReleaseRequest('workflow_dispatch', { inputs: { python: 'major' } }),
      context,
      async () => {
        throw new Error('must not allocate a second batch');
      }
    );
    expect(status.state).toBe('existing');
    expect(existing.writes).toEqual([]);
  });

  test('an authorized issue request receives the normalized active preview status', async () => {
    const { client, writes } = apiFixture({ active: true });
    await executePilotRequest(
      client,
      parseReleaseRequest('workflow_dispatch', { inputs: {} }),
      { ...context, issueNumber: 77 },
      async () => emptyPlan
    );
    expect(writes).toEqual([
      {
        path: '/repos/ComposioHQ/composio/issues/77/comments',
        body: {
          body: 'A preview is already active; no new versions were allocated.\n\nhttps://github.com/ComposioHQ/composio/pull/90',
        },
      },
    ]);
  });

  test('a retry after branch creation and a transient PR failure reuses the original plan-only branch', async () => {
    const { client, writes } = apiFixture({ failFirstPull: true });
    const plan = {
      ...emptyPlan,
      releases: [
        {
          name: '@composio/python-sdk',
          language: 'python' as const,
          oldVersion: '0.31.0',
          newVersion: '0.31.1',
          type: 'patch' as const,
          changesets: ['python-note'],
        },
      ],
    };
    const request = parseReleaseRequest('workflow_dispatch', { inputs: {} });
    await expect(executePilotRequest(client, request, context, async () => plan)).rejects.toThrow();
    const result = await executePilotRequest(client, request, context, async () => plan);
    expect(result.state).toBe('preview');
    expect(writes.filter(write => write.path.endsWith('/git/refs'))).toHaveLength(1);
  });

  test('a recovered preview branch with additional SDK changes cannot become a pilot PR', async () => {
    const options = { failFirstPull: true, tamperTree: false };
    const { client, writes } = apiFixture(options);
    const plan = {
      ...emptyPlan,
      releases: [
        {
          name: '@composio/python-sdk',
          language: 'python' as const,
          oldVersion: '0.31.0',
          newVersion: '0.31.1',
          type: 'patch' as const,
          changesets: ['python-note'],
        },
      ],
    };
    const request = parseReleaseRequest('workflow_dispatch', { inputs: {} });
    await expect(executePilotRequest(client, request, context, async () => plan)).rejects.toThrow();
    options.tamperTree = true;
    await expect(executePilotRequest(client, request, context, async () => plan)).rejects.toThrow(
      'source and plan'
    );
    expect(writes.filter(write => write.path.endsWith('/pulls'))).toHaveLength(1);
  });

  test('retry ignores new bump choices and asks GitHub to rerun failed jobs of the original guarded next run', async () => {
    const { client, writes } = apiFixture();
    const request = parseReleaseRequest('workflow_dispatch', {
      inputs: { action: 'retry', run_id: '120', python: 'major' },
    });
    const result = await executePilotRequest(client, request, context, async () => {
      throw new Error('retry must not plan');
    });
    expect(result.state).toBe('retrying');
    expect(writes).toEqual([
      { path: '/repos/ComposioHQ/composio/actions/runs/120/rerun-failed-jobs', body: null },
    ]);
  });

  test('a retry already queued returns the original status without rerunning again', async () => {
    const { client, writes } = apiFixture({ run: { status: 'queued', conclusion: null } });
    const result = await executePilotRequest(
      client,
      parseReleaseRequest('workflow_dispatch', { inputs: { action: 'retry', run_id: '120' } }),
      context,
      async () => emptyPlan
    );
    expect(result.state).toBe('run-status');
    expect(result.runUrl).toBe('https://github.com/ComposioHQ/composio/actions/runs/120');
    expect(writes).toEqual([]);
  });

  test('an arbitrary branch run cannot be retried through the controller', async () => {
    const { client, writes } = apiFixture({ run: { head_branch: 'untrusted' } });
    await expect(
      executePilotRequest(
        client,
        parseReleaseRequest('workflow_dispatch', { inputs: { action: 'retry', run_id: '120' } }),
        context,
        async () => emptyPlan
      )
    ).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  test('pilot audits real registry baselines in a temporary marker workspace without changing source metadata or notes', async () => {
    const cwd = await fixture();
    const calls: string[] = [];
    const registryFetch: ReleaseFetch = async input => {
      const url = String(input);
      calls.push(url);
      return new Response(
        JSON.stringify(
          url.includes('pypi.org')
            ? { releases: { '0.31.0': [{ yanked: false }] } }
            : { version: '0.28.0' }
        ),
        { headers: { 'content-type': 'application/json' } }
      );
    };
    const plan = await createPilotPlan(cwd, { typescript: 'auto', python: 'auto' }, registryFetch);
    expect(plan.releases.map(release => [release.name, release.newVersion])).toEqual([
      ['@composio/python-sdk', '0.31.1'],
    ]);
    expect(calls).toHaveLength(3);
    expect(await Bun.file(join(cwd, 'python/package.json')).exists()).toBe(false);
    expect(await readFile(join(cwd, 'python/pyproject.toml'), 'utf8')).toContain('0.31.0');
    expect(await readFile(join(cwd, '.changeset/python-note.md'), 'utf8')).toContain(
      'Fix account updates.'
    );
    await expect(
      createPilotPlan(
        cwd,
        { typescript: 'auto', python: 'auto' },
        async () => new Response('{}', { status: 503 })
      )
    ).rejects.toThrow();
  });
});
