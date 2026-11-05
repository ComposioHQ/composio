import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { executeReleaseRequest, type ReleaseRequestContext } from '../scripts/sdk-release/batch';
import type { SdkReleasePlan } from '../scripts/sdk-release/plan';
import { parseReleaseRequest, type ReleaseRequest } from '../scripts/sdk-release/request';
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
const request: ReleaseRequest = { typescript: 'auto', python: 'auto' };
const planned = (value: SdkReleasePlan) => () => Effect.succeed(value);
const failing = (message: string) => () =>
  Effect.sync((): SdkReleasePlan => {
    throw new Error(message);
  });
const execute = (
  fetch: Fetch,
  requestContext: ReleaseRequestContext,
  plan: () => Effect.Effect<SdkReleasePlan>
) => runRelease(executeReleaseRequest(request, requestContext, plan), fetch);

const openRelease = {
  number: 9,
  html_url: 'https://github.com/ComposioHQ/composio/pull/9',
  state: 'open',
  merged: false,
  merge_commit_sha: null,
  user: { login: 'sdk-release-app[bot]' },
  head: { sha, ref: 'sdk-release/batch-8', repo: { full_name: 'ComposioHQ/composio' } },
  base: { ref: 'next' },
};

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
    if (path.includes('/pulls?')) return respond(options.existing ? [openRelease] : []);
    if (method === 'POST' && path === '/repos/ComposioHQ/composio/issues')
      return respond({ number: 31 }, 201);
    if (path.endsWith('/issues/7/comments')) return respond({ id: 99 });
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  const writes = () => calls.filter(call => call.method !== 'GET');
  return { fetcher, writes };
}

describe('release request parsing', () => {
  test('the issue form and a dispatch read into the same request', () => {
    const issue = { issue: { body: '### TypeScript\n\nskip\n\n### Python\n\npatch\n' } };
    expect(parseReleaseRequest('issues', issue)).toEqual({ typescript: 'skip', python: 'patch' });
    expect(
      parseReleaseRequest('workflow_dispatch', { inputs: { typescript: 'skip', python: 'patch' } })
    ).toEqual({ typescript: 'skip', python: 'patch' });
    expect(parseReleaseRequest('workflow_dispatch', { inputs: {} })).toEqual(request);
  });
  test('a hand-written issue body and an unknown bump are refused', () => {
    expect(() => parseReleaseRequest('issues', { issue: { body: 'please release' } })).toThrow(
      'Use the SDK release request issue form'
    );
    expect(() =>
      parseReleaseRequest('workflow_dispatch', { inputs: { typescript: 'huge' } })
    ).toThrow();
  });
});

describe('SDK release member request', () => {
  for (const membership of ['pending', 'absent', 'error'] as const) {
    test(`${membership} membership fails before planning or any write`, async () => {
      const { fetcher, writes } = client({ membership });
      let planCalls = 0;
      await expect(
        execute(fetcher, context, () =>
          Effect.sync(() => {
            planCalls += 1;
            return plan;
          })
        )
      ).rejects.toThrow();
      expect(planCalls).toBe(0);
      expect(writes()).toEqual([]);
    });
  }

  test('an active member gets a batch frozen at the source and a reply on the issue', async () => {
    const { fetcher, writes } = client();
    const result = await execute(fetcher, context, planned(plan));
    expect(result.batch).toMatchObject({
      id: '21',
      inputBase: sha,
      requestedBy: 'member',
      issue: 7,
      plan,
    });
    expect(writes().map(call => call.path)).toEqual([
      '/repos/ComposioHQ/composio/issues/7/comments',
    ]);
  });

  test('a planning failure is reported on the issue with the request run', async () => {
    const { fetcher, writes } = client();
    await expect(execute(fetcher, context, failing('Invalid Changesets config'))).rejects.toThrow(
      'Invalid Changesets config'
    );
    expect(writes()).toEqual([
      {
        method: 'POST',
        path: '/repos/ComposioHQ/composio/issues/7/comments',
        body: { body: expect.stringContaining('/actions/runs/21') },
      },
    ]);
  });

  test('an open release PR stops the request before planning', async () => {
    const { fetcher, writes } = client({ existing: true });
    const result = await execute(fetcher, context, failing('must not plan'));
    expect(result.batch).toBeUndefined();
    expect(result.message).toContain('Another SDK release is in progress');
    expect(writes()).toEqual([
      {
        method: 'POST',
        path: '/repos/ComposioHQ/composio/issues/7/comments',
        body: { body: result.message },
      },
    ]);
  });

  test('an empty plan replies "Nothing to release." and plans no batch', async () => {
    const { fetcher, writes } = client();
    const result = await execute(fetcher, context, planned({ ...plan, releases: [] }));
    expect(result).toEqual({ message: 'Nothing to release.' });
    expect(writes()).toEqual([
      {
        method: 'POST',
        path: '/repos/ComposioHQ/composio/issues/7/comments',
        body: { body: 'Nothing to release.' },
      },
    ]);
  });

  test('a dispatch-started release opens its tracking issue', async () => {
    const { fetcher, writes } = client();
    const result = await execute(fetcher, { ...context, issueNumber: undefined }, planned(plan));
    expect(result.batch?.issue).toBe(31);
    expect(writes().map(call => `${call.method} ${call.path}`)).toEqual([
      'POST /repos/ComposioHQ/composio/issues',
    ]);
  });
});
