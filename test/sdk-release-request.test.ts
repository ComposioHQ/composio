import { describe, expect, test } from 'bun:test';
import { GitHubReleaseClient, type ReleaseFetch } from '../scripts/sdk-release/github';
import { executeReleaseRequest } from '../scripts/sdk-release/batch';
import { parseReleaseRequest, releaseRequestSchema } from '../scripts/sdk-release/request';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SdkReleasePlan } from '../scripts/sdk-release/plan';

const sha = 'a'.repeat(40);
const context = { actor: 'member', runId: '21', sourceSha: sha, issueNumber: 7 };
const plan: SdkReleasePlan = {
  schemaVersion: 1,
  inputFingerprint: 'frozen',
  choices: { typescript: 'auto', python: 'auto' },
  recommended: [],
  changesets: [],
  retainedChangesets: [],
  releases: [
    {
      name: '@composio/python-sdk',
      oldVersion: '0.31.0',
      newVersion: '0.31.1',
      type: 'patch',
      changesets: [],
      language: 'python',
    },
  ],
};
function client(
  options: {
    membership?: 'active' | 'pending' | 'absent' | 'error';
    existing?: boolean;
    runStatus?: string;
    runBranch?: string;
    preparing?: boolean;
    publication?: 'active' | 'verified' | 'terminal';
    runAttempt?: number;
    createdAt?: string;
    authorizationFailure?: boolean;
    authorizationLost?: boolean;
  } = {}
) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const saved = {
    schemaVersion: 1,
    id: '8',
    originalRunId: '8',
    inputBase: sha,
    statusUrl: 'https://github.com/ComposioHQ/composio/issues/7',
    date: '2026-11-03',
    outputs: [],
    plan,
  };
  const nativeRun = (id: number, branch: string) => ({
    id,
    path: '.github/workflows/sdk.release.yml',
    head_branch: branch,
    head_sha: sha,
    event: branch === 'next' ? 'workflow_dispatch' : 'push',
    repository: { full_name: 'ComposioHQ/composio' },
    status: options.runStatus ?? 'completed',
    conclusion: options.authorizationFailure && id === 8 ? 'success' : 'failure',
    created_at: options.createdAt ?? new Date().toISOString(),
    run_attempt: options.runAttempt ?? 2,
    html_url: `https://github.com/ComposioHQ/composio/actions/runs/${id}`,
  });
  const fetcher: ReleaseFetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname + url.search;
    calls.push({ method, path, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (path === '/orgs/ComposioHQ/memberships/member') {
      if (options.membership === 'absent') return respond({}, 404);
      if (options.membership === 'error') return respond({}, 503);
      return respond({ state: options.membership ?? 'active' });
    }
    if (path.includes('/pulls?'))
      return respond(
        options.existing
          ? [
              {
                number: 9,
                html_url: 'https://github.com/ComposioHQ/composio/pull/9',
                body: '<!-- sdk-release-batch -->',
                state: 'open',
                merged: options.authorizationFailure ?? false,
                merge_commit_sha: options.authorizationFailure ? 'b'.repeat(40) : null,
                user: { login: 'bot' },
                head: {
                  sha,
                  ref: 'sdk-release/batch-8',
                  repo: { full_name: 'ComposioHQ/composio' },
                },
                base: { ref: 'next' },
              },
            ]
          : []
      );
    if (path.includes('/actions/workflows/sdk.release.yml/runs')) {
      const runs =
        url.searchParams.get('event') === 'pull_request_target' && options.authorizationFailure
          ? [{ ...nativeRun(10, 'next'), event: 'pull_request_target' }]
          : url.searchParams.get('event') === 'push'
            ? options.publication
              ? [nativeRun(9, 'sdk-release/8')]
              : []
            : options.preparing
              ? [nativeRun(22, 'next')]
              : [];
      return respond({ total_count: runs.length, workflow_runs: runs });
    }
    if (path.includes('/actions/runs/10/jobs'))
      return respond({ jobs: [{ name: 'source-tag', conclusion: 'failure', steps: [] }] });
    if (path.includes('/git/ref/tags/sdk-release/8'))
      return respond({ object: { type: 'commit', sha } });
    if (path.includes('/actions/runs/9/jobs'))
      return respond({
        jobs:
          options.publication === 'verified'
            ? [{ name: 'Verify public SDK packages', conclusion: 'success', steps: [] }]
            : [
                {
                  name: 'Publish original PyPI candidates',
                  conclusion: 'failure',
                  steps: [
                    {
                      name: 'Upload original candidates to PyPI',
                      status: 'completed',
                      conclusion: 'failure',
                    },
                  ],
                },
              ],
      });
    if (path.includes('/actions/runs/9/artifacts'))
      return respond({
        artifacts:
          options.publication === 'terminal'
            ? []
            : [
                {
                  id: 56,
                  name: 'sdk-candidate-python',
                  digest: `sha256:${'c'.repeat(64)}`,
                  expired: false,
                  created_at: new Date().toISOString(),
                  expires_at: '2099-12-01T00:00:00Z',
                  workflow_run: { id: 9, head_sha: sha },
                },
              ],
      });
    if (path.includes('/actions/runs/22/jobs'))
      return respond({ jobs: [{ name: 'prepare', status: 'in_progress', conclusion: null }] });
    if (path.includes('/actions/runs/22/artifacts'))
      return respond({
        artifacts: [
          {
            id: 57,
            name: 'sdk-authorized-batch',
            digest: `sha256:${'c'.repeat(64)}`,
            expired: false,
            created_at: new Date().toISOString(),
            expires_at: '2099-12-01T00:00:00Z',
            workflow_run: { id: 22, head_sha: sha },
          },
        ],
      });
    if (
      path.includes('/contents/.github/sdk-release-plan.json') &&
      !options.publication &&
      !options.authorizationFailure &&
      url.searchParams.get('ref') === 'next'
    )
      return respond({}, 404);
    if (path.includes('/contents/.github/sdk-release-plan.json'))
      return respond({
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(saved)).toString('base64'),
      });
    if (path.includes('/actions/runs/8/artifacts'))
      return respond({
        artifacts: options.authorizationLost
          ? []
          : [
              {
                id: 55,
                name: 'sdk-authorized-batch',
                digest: `sha256:${'c'.repeat(64)}`,
                expired: false,
                created_at: '2026-11-03T00:00:00Z',
                expires_at: '2099-12-01T00:00:00Z',
                workflow_run: { id: 8, head_sha: sha },
              },
            ],
      });
    if (path.endsWith('/actions/runs/8')) return respond(nativeRun(8, options.runBranch ?? 'next'));
    if (path.endsWith('/rerun-failed-jobs')) return new Response(null, { status: 201 });
    if (path.endsWith('/actions/workflows/docs.sdk-change-sync.yml/dispatches'))
      return new Response(null, { status: 204 });
    if (path.endsWith('/issues/7/comments')) return respond({ id: 99 });
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  class FixtureClient extends GitHubReleaseClient {
    override async downloadArtifact(_artifact: { id: number; digest: string }, directory: string) {
      await writeFile(join(directory, 'sdk-release-batch.json'), JSON.stringify(saved));
    }
  }
  return { github: new FixtureClient('token', fetcher), calls };
}
const request = releaseRequestSchema.parse({ action: 'release' });

describe('SDK release member request', () => {
  test('issue and dispatch normalize through the same active schema', () => {
    const issue = {
      issue: {
        body: '### Action\n\nrelease\n\n### TypeScript\n\nauto\n\n### Python\n\npatch\n\n### Original run ID\n\n_No response_\n',
      },
    };
    expect(parseReleaseRequest('issues', issue)).toEqual(
      parseReleaseRequest('workflow_dispatch', { inputs: { action: 'release', python: 'patch' } })
    );
    expect(parseReleaseRequest('workflow_dispatch', { inputs: {} }).action).toBe('release');
  });
  for (const membership of ['pending', 'absent', 'error'] as const) {
    test(`${membership} membership fails before planning or any release write`, async () => {
      const { github, calls } = client({ membership });
      let planned = false;
      await expect(
        executeReleaseRequest(github, request, context, async () => {
          planned = true;
          return plan;
        })
      ).rejects.toThrow();
      expect(planned).toBe(false);
      expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
    });
  }
  test('an active private member with repository Read authorizes preparation and gets issue status', async () => {
    const { github, calls } = client();
    const result = await executeReleaseRequest(
      github,
      request,
      context,
      async () => plan,
      async () => ['python/CHANGELOG.md']
    );
    expect(result.batch?.inputBase).toBe(sha);
    expect(result.batch?.plan.releases[0].newVersion).toBe('0.31.1');
    expect(JSON.stringify(result.batch)).not.toContain('approvedHead');
    expect(calls.filter(call => call.method !== 'GET').map(call => call.path)).toEqual([
      '/repos/ComposioHQ/composio/issues/7/comments',
    ]);
  });
  test('an active release returns its status without allocating another plan', async () => {
    const { github } = client({ existing: true });
    const result = await executeReleaseRequest(github, request, context, async () => {
      throw new Error('must not plan');
    });
    expect(result.pullRequest).toBe('https://github.com/ComposioHQ/composio/pull/9');
  });
  for (const options of [
    { preparing: true },
    { publication: 'active' as const },
    { publication: 'active' as const, runAttempt: 50, runStatus: 'in_progress' },
  ]) {
    test(`native ${JSON.stringify(options)} blocks allocation before a PR exists`, async () => {
      const { github } = client(options);
      const result = await executeReleaseRequest(github, request, context, async () => {
        throw new Error('must not allocate');
      });
      expect(result.message).toContain('already active');
      expect(result.runUrl).toContain('/actions/runs/');
    });
  }
  test('retry resolves the actual tag producer instead of rerunning the earlier preparation', async () => {
    const { github, calls } = client({ publication: 'active' });
    await executeReleaseRequest(
      github,
      releaseRequestSchema.parse({ action: 'retry', run_id: '8', python: 'major' }),
      context,
      async () => {
        throw new Error('must not plan');
      }
    );
    expect(
      calls.filter(call => call.path.endsWith('/rerun-failed-jobs')).map(call => call.path)
    ).toEqual(['/repos/ComposioHQ/composio/actions/runs/9/rerun-failed-jobs']);
  });
  test('a transient source-tag authorization failure reruns that original failed stage without new allocation', async () => {
    const { github, calls } = client({ authorizationFailure: true, existing: true });
    await executeReleaseRequest(
      github,
      releaseRequestSchema.parse({ action: 'retry', run_id: '8' }),
      context,
      async () => {
        throw new Error('must not allocate');
      }
    );
    expect(
      calls.filter(call => call.path.endsWith('/rerun-failed-jobs')).map(call => call.path)
    ).toEqual(['/repos/ComposioHQ/composio/actions/runs/10/rerun-failed-jobs']);
  });
  test('docs retry after registry success ignores artifact loss, age and exhausted publisher attempts', async () => {
    const { github, calls } = client({
      publication: 'verified',
      runAttempt: 50,
      createdAt: '2025-01-01T00:00:00Z',
    });
    const result = await executeReleaseRequest(
      github,
      releaseRequestSchema.parse({ action: 'retry', run_id: '8' }),
      context,
      async () => {
        throw new Error('must not plan');
      }
    );
    expect(result.message).toContain('without registry identity');
    expect(calls.filter(call => call.method === 'POST').map(call => call.path)).toEqual([
      '/repos/ComposioHQ/composio/actions/workflows/docs.sdk-change-sync.yml/dispatches',
      '/repos/ComposioHQ/composio/issues/7/comments',
    ]);
    expect(calls.some(call => call.path.includes('/artifacts'))).toBe(false);
  });
  test('partial upload with deleted candidates stops same-version recovery', async () => {
    const { github, calls } = client({ publication: 'terminal' });
    await expect(
      executeReleaseRequest(
        github,
        releaseRequestSchema.parse({ action: 'retry', run_id: '8' }),
        context,
        async () => plan
      )
    ).rejects.toThrow('higher-version corrective');
    expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
  });
  test('lost preparation authorization ends recovery even while publication candidates remain available', async () => {
    const { github, calls } = client({ publication: 'active', authorizationLost: true });
    await expect(
      executeReleaseRequest(
        github,
        releaseRequestSchema.parse({ action: 'retry', run_id: '8' }),
        context,
        async () => plan
      )
    ).rejects.toThrow('higher-version corrective');
    expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
  });
  test('explicit refresh prepares a replacement from the original version baseline and choices', async () => {
    const { github, calls } = client({ existing: true });
    const result = await executeReleaseRequest(
      github,
      releaseRequestSchema.parse({ action: 'refresh' }),
      context,
      async choices => {
        expect(choices).toEqual(plan.choices);
        return plan;
      },
      async () => ['python/CHANGELOG.md']
    );
    expect(result.batch?.replaces).toEqual({ number: 9, headSha: sha });
    expect(result.batch?.id).toBe('21');
    expect(calls.some(call => call.method === 'PATCH')).toBe(false);
  });
  test('refresh refuses to silently advance the original version baseline', async () => {
    const { github } = client({ existing: true });
    await expect(
      executeReleaseRequest(
        github,
        releaseRequestSchema.parse({ action: 'refresh' }),
        context,
        async () => ({
          ...plan,
          releases: plan.releases.map(release => ({ ...release, oldVersion: '0.32.0' })),
        })
      )
    ).rejects.toThrow('original version baseline');
  });
  test('retry takes priority over an open release PR and ignores new bump choices', async () => {
    const { github, calls } = client({ existing: true });
    const result = await executeReleaseRequest(
      github,
      releaseRequestSchema.parse({ action: 'retry', run_id: '8', python: 'major' }),
      context,
      async () => {
        throw new Error('must not plan');
      }
    );
    expect(result.message).toContain('ignored');
    expect(
      calls.filter(call => call.method === 'POST' && call.path.endsWith('/rerun-failed-jobs'))
    ).toHaveLength(1);
  });
  test('queued retry reports the original run without another rerun', async () => {
    const { github, calls } = client({ runStatus: 'queued' });
    const result = await executeReleaseRequest(
      github,
      releaseRequestSchema.parse({ action: 'retry', run_id: '8' }),
      context,
      async () => plan
    );
    expect(result.message).toContain('queued');
    expect(calls.some(call => call.path.endsWith('/rerun-failed-jobs'))).toBe(false);
  });
  test('unrelated source branches cannot be retried', async () => {
    const { github, calls } = client({ runBranch: 'attacker-branch' });
    await expect(
      executeReleaseRequest(
        github,
        releaseRequestSchema.parse({ action: 'retry', run_id: '8' }),
        context,
        async () => plan
      )
    ).rejects.toThrow('guarded');
    expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
  });
  test('a reconciled no-op creates no branch or source commit', async () => {
    const { github, calls } = client();
    const result = await executeReleaseRequest(
      github,
      request,
      { ...context, issueNumber: undefined },
      async () => ({ ...plan, releases: [] })
    );
    expect(result.message).toContain('Nothing to release');
    expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
  });
});
