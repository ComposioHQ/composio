import { beforeAll, describe, expect, test } from 'bun:test';
import { Effect, Exit } from 'effect';
import { regateRelease, releaseToRegate } from '../scripts/sdk-release/batch';
import type { Recording } from '../scripts/sdk-release/record-github-fixtures';
import { json, readText, runRelease } from './sdk-release-harness';
import {
  RELEASE_5278,
  loadRecordings,
  replay,
  withCandidateDocs,
  type Override,
} from './sdk-release-github-recordings';

/** `next` after release #5278 merged: its squash commit carries the release plan. */
const NEXT = '5738b0d59bab9aced57332a834a9fda7757fe108';
const tagPath = `/git/ref/tags/sdk-release/${RELEASE_5278.id}`;
const notFound: Override = () => json({ message: 'Not Found' }, 404);

let recordings: ReadonlyArray<Recording> = [];
let plan = '';
beforeAll(async () => {
  recordings = await loadRecordings();
  plan = String(recordings.find(recording => recording.contract === 'ReleasePlan')?.body ?? '');
});

/** The recorded release, with the plan on `next` and an active requester by default. */
const github = (overrides: Record<string, Override> = {}) =>
  replay(recordings, {
    ...withCandidateDocs,
    '/orgs/ComposioHQ/memberships/maintainer': () => json({ state: 'active' }),
    [`/contents/.github/sdk-release-plan.json?ref=${NEXT}`]: () => new Response(plan),
    [tagPath]: notFound,
    ...overrides,
  });

const regate = (fetcher: ReturnType<typeof replay>['fetcher'], actor = 'maintainer') =>
  runRelease(
    Effect.exit(
      Effect.flatMap(releaseToRegate(actor, NEXT), ({ pull, batch }) =>
        regateRelease(pull, batch, RELEASE_5278.appSlug)
      )
    ),
    fetcher
  );

const tagged = Exit.succeed({ _tag: 'Tagged', tag: `sdk-release/${RELEASE_5278.id}` } as const);

describe('regate', () => {
  test('tags the merged, untagged release on next at its reviewed head', async () => {
    const api = github();
    expect(await regate(api.fetcher)).toEqual(tagged);
    expect(api.writes).toEqual([
      {
        method: 'POST',
        path: '/git/refs',
        body: { ref: `refs/tags/sdk-release/${RELEASE_5278.id}`, sha: RELEASE_5278.head },
      },
    ]);
  });

  test('reports Tagged without writing when the tag is already on the reviewed head', async () => {
    const api = github({ [tagPath]: recorded => json(recorded) });
    expect(await regate(api.fetcher)).toEqual(tagged);
    expect(api.writes).toEqual([]);
  });

  test("leaves an already-tagged release alone, even one today's gate would refuse", async () => {
    // #5278 predates the SDK candidate docs check, so without the stand-in it fails today's gate.
    const api = replay(recordings, {
      '/orgs/ComposioHQ/memberships/maintainer': () => json({ state: 'active' }),
      [`/contents/.github/sdk-release-plan.json?ref=${NEXT}`]: () => new Response(plan),
    });
    expect(await regate(api.fetcher)).toEqual(tagged);
    expect(api.writes).toEqual([]);
  });

  test('refuses a tag that points at another commit', async () => {
    const api = github({
      [tagPath]: () => json({ object: { type: 'commit', sha: NEXT } }),
    });
    expect(String(await regate(api.fetcher))).toContain('already points to another source');
    expect(api.writes).toEqual([]);
  });

  test('fails with nothing to re-gate when next carries no release plan', async () => {
    const api = github({ [`/contents/.github/sdk-release-plan.json?ref=${NEXT}`]: notFound });
    expect(String(await regate(api.fetcher))).toContain('Nothing to re-gate');
    expect(api.writes).toEqual([]);
  });

  test('reports a release PR closed without merging as abandoned', async () => {
    const api = github({
      [`/pulls/${RELEASE_5278.pull}`]: recorded => json({ ...(recorded as object), merged: false }),
    });
    expect(await regate(api.fetcher)).toEqual(
      Exit.succeed({
        _tag: 'Abandoned',
        pull: `https://github.com/ComposioHQ/composio/pull/${RELEASE_5278.pull}`,
      })
    );
    expect(api.writes).toEqual([]);
  });

  test('refuses a release that fails the gate, exactly as the tag job does', async () => {
    const api = github({
      [`/pulls/${RELEASE_5278.pull}/reviews?per_page=100&page=1`]: () => json([]),
    });
    expect(await regate(api.fetcher)).toEqual(
      Exit.succeed({
        _tag: 'Refused',
        pull: `https://github.com/ComposioHQ/composio/pull/${RELEASE_5278.pull}`,
        reason: expect.stringContaining('lacks an approval'),
      })
    );
    expect(api.writes.map(write => write.path)).toEqual([`/issues/${RELEASE_5278.pull}/comments`]);
  });

  test('requires an active ComposioHQ member', async () => {
    const api = github({
      '/orgs/ComposioHQ/memberships/outsider': () => json({ message: 'Not Found' }, 404),
    });
    expect(String(await regate(api.fetcher, 'outsider'))).toContain('(404)');
    expect(api.writes).toEqual([]);
  });
});

describe('regate job', () => {
  test('runs only for a regate dispatch on next, in the tag job concurrency group', async () => {
    const workflow = Bun.YAML.parse(await readText('.github/workflows/sdk.release.yml')) as {
      on: { workflow_dispatch: { inputs: { action: { options: string[] } } } };
      jobs: Record<string, { if?: string; concurrency?: { group: string } }>;
    };
    expect(workflow.on.workflow_dispatch.inputs.action.options).toEqual(['request', 'regate']);
    const { regate, tag, plan } = workflow.jobs;
    expect(regate.if).toContain("github.ref == 'refs/heads/next'");
    expect(regate.if).toContain("inputs.action == 'regate'");
    expect(plan.if).toContain("inputs.action == 'request'");
    expect(regate.concurrency?.group).toBe(tag.concurrency?.group);
  });
});
