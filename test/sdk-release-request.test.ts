import { describe, expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import {
  executeReleaseRequest,
  supersededRelease,
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
const request = decodeRequest({});

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
  test('issue and dispatch normalize through the same release-only schema', () => {
    const issue = (supersede: string) => ({
      issue: {
        body: `### TypeScript\n\nauto\n\n### Python\n\npatch\n\n### Supersede a stranded release\n\n${supersede}\n`,
      },
    });
    expect(parseReleaseRequest('issues', issue('no'))).toEqual(
      parseReleaseRequest('workflow_dispatch', { inputs: { python: 'patch' } })
    );
    expect(parseReleaseRequest('issues', issue('yes'))).toEqual(
      parseReleaseRequest('workflow_dispatch', { inputs: { python: 'patch', supersede: 'true' } })
    );
    expect(parseReleaseRequest('workflow_dispatch', { inputs: {} })).toEqual({
      typescript: 'auto',
      python: 'auto',
      supersede: false,
    });
    expect(Object.keys(ReleaseRequest.fields).sort()).toEqual([
      'python',
      'supersede',
      'typescript',
    ]);
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
});

type TaggedRelease = Pick<SdkReleasePlan['releases'][number], 'name' | 'oldVersion' | 'newVersion'>;
const typescriptRelease = (name: string, oldVersion: string, newVersion: string) =>
  ({ name, oldVersion, newVersion, language: 'typescript' }) as const;
const pythonRelease = { name: '@composio/python-sdk', oldVersion: '0.31.0', newVersion: '0.31.1' };
const PYTHON_PACKAGES = ['composio', 'composio-openai'];

/** Tags sdk-release/9 and sdk-release/12; only batch 12 carries the given releases. */
function tagged(releases: ReadonlyArray<TaggedRelease & { language: 'typescript' | 'python' }>) {
  const batch = (id: string, value: typeof releases) => ({
    schemaVersion: 1,
    id,
    inputBase: sha,
    originalRunId: id,
    requestedBy: ['member'],
    statusUrl: 'https://github.com/ComposioHQ/composio/issues/7',
    date: '2026-11-01',
    plan: {
      ...plan,
      releases: value.map(release => ({ ...release, type: 'patch', changesets: [] })),
    },
    outputs: [],
  });
  const batches: Record<string, unknown> = {
    ['9'.repeat(40)]: batch('9', [typescriptRelease('@composio/core', '0.27.0', '0.28.0')]),
    ['c'.repeat(40)]: batch('12', releases),
  };
  const fetcher: Fetch = async input => {
    const url = new URL(String(input));
    const respond = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.pathname === '/repos/ComposioHQ/composio/git/matching-refs/tags/sdk-release/')
      return respond(
        Object.keys(batches).map(commit => ({
          ref: `refs/tags/sdk-release/${commit === 'c'.repeat(40) ? '12' : '9'}`,
          object: { type: 'commit', sha: commit },
        }))
      );
    if (url.pathname === '/repos/ComposioHQ/composio/contents/.github/sdk-release-plan.json') {
      const content = Buffer.from(
        JSON.stringify(batches[url.searchParams.get('ref') ?? ''])
      ).toString('base64');
      return respond({ encoding: 'base64', content });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  return fetcher;
}

describe('SDK release supersede', () => {
  test('an npm partial selects only the stranded packages of the newest tagged release', async () => {
    const fetcher = tagged([
      typescriptRelease('@composio/core', '0.28.0', '0.29.0'),
      typescriptRelease('@composio/slim', '0.28.0', '0.29.0'),
      typescriptRelease('@composio/provider', '0.11.0', '0.11.1'),
    ]);
    const baseline = {
      '@composio/core': '0.29.0',
      '@composio/slim': '0.29.0',
      '@composio/provider': '0.11.0',
      composio: '0.31.0',
      'composio-openai': '0.31.0',
    };
    expect(await runRelease(supersededRelease(baseline, PYTHON_PACKAGES), fetcher)).toEqual({
      batchId: '12',
      releases: [typescriptRelease('@composio/provider', '0.11.0', '0.11.1')],
    });
  });
  test('one unpublished Python provider strands the whole Python lane', async () => {
    const fetcher = tagged([{ ...pythonRelease, language: 'python' }]);
    const baseline = {
      '@composio/core': '0.28.0',
      composio: '0.31.1',
      'composio-openai': '0.31.0',
    };
    expect(await runRelease(supersededRelease(baseline, PYTHON_PACKAGES), fetcher)).toEqual({
      batchId: '12',
      releases: [{ ...pythonRelease, language: 'python' }],
    });
  });
  test('supersede is refused when the newest tagged release is fully published', async () => {
    const fetcher = tagged([
      typescriptRelease('@composio/provider', '0.11.0', '0.11.1'),
      { ...pythonRelease, language: 'python' },
    ]);
    const baseline = {
      '@composio/provider': '0.11.1',
      composio: '0.31.1',
      'composio-openai': '0.31.1',
    };
    await expect(runRelease(supersededRelease(baseline, PYTHON_PACKAGES), fetcher)).rejects.toThrow(
      'Nothing to supersede: every version planned by sdk-release/12 is published'
    );
  });
});
