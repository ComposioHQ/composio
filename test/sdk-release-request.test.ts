import { describe, expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import {
  executeReleaseRequest,
  type PlanRelease,
  type ReleaseOutputs,
  type ReleaseRequestContext,
} from '../scripts/sdk-release/batch';
import type { SdkReleasePlan } from '../scripts/sdk-release/plan';
import { ReleaseRequest, parseReleaseRequest } from '../scripts/sdk-release/request';
import { runRelease, type Fetch } from './sdk-release-harness';

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
const decodeRequest = Schema.decodeUnknownSync(ReleaseRequest);
const execute = (
  fetch: Fetch,
  value: ReleaseRequest,
  requestContext: ReleaseRequestContext,
  planRelease: PlanRelease<unknown, never>,
  outputs?: ReleaseOutputs<never, never>
) => runRelease(executeReleaseRequest(value, requestContext, planRelease, outputs), fetch);
const planOf =
  (value: SdkReleasePlan): PlanRelease<never, never> =>
  () =>
    Effect.succeed(value);
const unexpectedPlan =
  (message: string): PlanRelease<never, never> =>
  () =>
    Effect.sync((): SdkReleasePlan => {
      throw new Error(message);
    });
const outputsOf =
  (paths: ReadonlyArray<string>): ReleaseOutputs<never, never> =>
  () =>
    Effect.succeed(paths);

function client(
  options: { membership?: 'active' | 'pending' | 'absent' | 'error'; existing?: boolean } = {}
) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const fetcher: Fetch = async (input, init) => {
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
                merged: false,
                merge_commit_sha: null,
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
    if (method === 'POST' && path === '/repos/ComposioHQ/composio/issues')
      return respond({ number: 31 }, 201);
    if (path.endsWith('/issues/7/comments')) return respond({ id: 99 });
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  return { github: fetcher, calls };
}
const request = decodeRequest({ action: 'release' });

describe('SDK release member request', () => {
  test('an authorized planning failure reports its reason and request run without release writes', async () => {
    const { github, calls } = client();
    await expect(
      execute(github, request, context, unexpectedPlan('Public baseline does not match the source'))
    ).rejects.toThrow('Public baseline');
    const writes = calls.filter(call => call.method !== 'GET');
    expect(writes.map(call => call.path)).toEqual(['/repos/ComposioHQ/composio/issues/7/comments']);
    expect(writes[0].body).toEqual({ body: expect.stringContaining('Public baseline') });
    expect(writes[0].body).toEqual({ body: expect.stringContaining('/actions/runs/21') });
  });
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
        execute(github, request, context, () =>
          Effect.sync(() => {
            planned = true;
            return plan;
          })
        )
      ).rejects.toThrow();
      expect(planned).toBe(false);
      expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
    });
  }
  test('an active private member with repository Read authorizes preparation and gets issue status', async () => {
    const { github, calls } = client();
    const result = await execute(
      github,
      request,
      context,
      planOf(plan),
      outputsOf(['python/CHANGELOG.md'])
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
    const result = await execute(github, request, context, unexpectedPlan('must not plan'));
    expect(result.pullRequest).toBe('https://github.com/ComposioHQ/composio/pull/9');
  });
  test('a reconciled no-op creates no branch or source commit', async () => {
    const { github, calls } = client();
    const result = await execute(
      github,
      request,
      { ...context, issueNumber: undefined },
      planOf({ ...plan, releases: [] })
    );
    expect(result.message).toContain('Nothing to release');
    expect(calls.filter(call => call.method !== 'GET')).toEqual([]);
  });
  test('a dispatch-started release opens a request issue and records it as the status URL', async () => {
    const { github, calls } = client();
    const result = await execute(
      github,
      request,
      { ...context, issueNumber: undefined },
      planOf(plan),
      outputsOf([])
    );
    expect(result.batch?.statusUrl).toBe('https://github.com/ComposioHQ/composio/issues/31');
    const writes = calls.filter(call => call.method !== 'GET');
    expect(writes.map(call => `${call.method} ${call.path}`)).toEqual([
      'POST /repos/ComposioHQ/composio/issues',
    ]);
    expect(writes[0].body).toEqual(
      expect.objectContaining({ body: expect.stringContaining('/actions/runs/21') })
    );
  });
  for (const action of ['retry', 'status', 'refresh'] as const) {
    test(`a ${action} request is refused and points to re-running failed jobs`, async () => {
      const { github, calls } = client({ existing: true });
      await expect(
        execute(
          github,
          decodeRequest({ action, run_id: '8' }),
          context,
          unexpectedPlan('must not plan')
        )
      ).rejects.toThrow(`The ${action} action is no longer supported`);
      const writes = calls.filter(call => call.method !== 'GET');
      expect(writes.map(call => call.path)).toEqual([
        '/repos/ComposioHQ/composio/issues/7/comments',
      ]);
      expect(writes[0].body).toEqual({ body: expect.stringContaining('Re-run failed jobs') });
    });
  }
});
