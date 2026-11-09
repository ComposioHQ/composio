import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { executeReleaseRequest, type ReleaseRequestContext } from '../scripts/sdk-release/batch';
import type { SdkReleasePlan } from '../scripts/sdk-release/plan';
import { parseReleaseRequest, type ReleaseRequest } from '../scripts/sdk-release/request';
import { runRelease, type Fetch } from './sdk-release-harness';

const sha = 'a'.repeat(40);
const context = {
  actor: 'member',
  runId: '21',
  sourceSha: sha,
  issueNumber: 7,
  appSlug: 'sdk-release-app',
};
const plan: SdkReleasePlan = {
  schemaVersion: 1,
  inputFingerprint: 'frozen',
  choices: { typescript: 'auto', python: 'auto', channel: 'stable' },
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
const request: ReleaseRequest = { channel: 'stable', typescript: 'auto', python: 'auto' };
const planned = (value: SdkReleasePlan) => () => Effect.succeed(value);
const failing = (message: string) => () =>
  Effect.sync((): SdkReleasePlan => {
    throw new Error(message);
  });
const execute = (
  fetch: Fetch,
  requestContext: ReleaseRequestContext,
  plan: () => Effect.Effect<SdkReleasePlan>,
  parse: Effect.Effect<ReleaseRequest, string> = Effect.succeed(request)
) =>
  runRelease(
    Effect.map(executeReleaseRequest(parse, requestContext, plan), result => result.outcome),
    fetch
  );

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
  options: {
    membership?: 'active' | 'pending' | 'absent' | 'error';
    /** Head branch of a release PR already open into next. */
    open?: string;
    /** The release plan committed on next, and whether its tag exists. */
    committed?: { id: string; tagged: boolean };
  } = {}
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
        options.open ? [{ ...openRelease, head: { ...openRelease.head, ref: options.open } }] : []
      );
    if (path.startsWith('/repos/ComposioHQ/composio/contents/.github/sdk-release-plan.json'))
      return options.committed
        ? new Response(JSON.stringify({ id: options.committed.id }))
        : respond({}, 404);
    if (path === `/repos/ComposioHQ/composio/git/ref/tags/sdk-release/${options.committed?.id}`)
      return options.committed?.tagged
        ? respond({ object: { type: 'commit', sha } })
        : respond({}, 404);
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
    const issue = {
      issue: { body: '### Channel\n\nbeta\n\n### TypeScript\n\nskip\n\n### Python\n\npatch\n' },
    };
    expect(parseReleaseRequest('issues', issue)).toEqual({
      channel: 'beta',
      typescript: 'skip',
      python: 'patch',
    });
    expect(
      parseReleaseRequest('workflow_dispatch', { inputs: { typescript: 'skip', python: 'patch' } })
    ).toEqual({ channel: 'stable', typescript: 'skip', python: 'patch' });
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

  test('an active member gets a batch frozen at the source, and nothing is posted', async () => {
    const { fetcher, writes } = client();
    const outcome = await execute(fetcher, context, planned(plan));
    expect(outcome).toMatchObject({
      _tag: 'Planned',
      batch: { id: '21', inputBase: sha, requestedBy: 'member', issue: 7, plan },
    });
    expect(writes()).toEqual([]);
  });

  test('a planning failure fails the job without posting; the status job reports it', async () => {
    const { fetcher, writes } = client();
    await expect(execute(fetcher, context, failing('Invalid Changesets config'))).rejects.toThrow(
      'Invalid Changesets config'
    );
    expect(writes()).toEqual([]);
  });

  test("a member's unreadable form needs input and plans nothing", async () => {
    const { fetcher } = client();
    expect(
      await execute(fetcher, context, failing('must not plan'), Effect.fail('Use the form'))
    ).toEqual({ _tag: 'NeedsInput', reason: 'Use the form' });
  });

  test('another open release PR makes the request wait, before planning', async () => {
    const { fetcher, writes } = client({ open: 'sdk-release/batch-8' });
    expect(await execute(fetcher, context, failing('must not plan'))).toEqual({
      _tag: 'Waiting',
      pull: openRelease.html_url,
    });
    expect(writes()).toEqual([]);
  });

  test('a re-run that finds its own release PR resumes it instead of waiting', async () => {
    const { fetcher } = client({ open: 'sdk-release/batch-21' });
    expect(await execute(fetcher, context, failing('must not plan'))).toEqual({
      _tag: 'InReview',
      pull: openRelease.html_url,
    });
  });

  test('a merged release plan on next without its tag blocks new planning', async () => {
    const blocked = client({ committed: { id: '20', tagged: false } });
    expect(await execute(blocked.fetcher, context, failing('must not plan'))).toEqual({
      _tag: 'Blocked',
      release: '20',
    });
    const tagged = client({ committed: { id: '20', tagged: true } });
    expect(await execute(tagged.fetcher, context, planned(plan))).toMatchObject({
      _tag: 'Planned',
    });
  });

  test('an empty plan ends the request with nothing to release', async () => {
    const { fetcher, writes } = client();
    expect(await execute(fetcher, context, planned({ ...plan, releases: [] }))).toEqual({
      _tag: 'Empty',
    });
    expect(writes()).toEqual([]);
  });

  test('the request issue travels with every outcome, so the status job can show it', async () => {
    const waiting = client({ open: 'sdk-release/batch-8' });
    const result = await runRelease(
      executeReleaseRequest(Effect.succeed(request), context, failing('must not plan')),
      waiting.fetcher
    );
    expect(result.issue).toEqual(Option.some(7));
    const dispatched = client();
    const planned = await runRelease(
      executeReleaseRequest(Effect.succeed(request), { ...context, issueNumber: undefined }, () =>
        Effect.succeed(plan)
      ),
      dispatched.fetcher
    );
    expect(planned.issue).toEqual(Option.some(31));
  });

  test('a dispatch-started release opens its tracking issue', async () => {
    const { fetcher, writes } = client();
    const outcome = await execute(fetcher, { ...context, issueNumber: undefined }, planned(plan));
    expect(outcome).toMatchObject({ _tag: 'Planned', batch: { issue: 31 } });
    expect(writes().map(call => `${call.method} ${call.path}`)).toEqual([
      'POST /repos/ComposioHQ/composio/issues',
    ]);
  });
});
