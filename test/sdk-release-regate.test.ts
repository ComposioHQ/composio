import { describe, expect, test } from 'bun:test';
import { Effect, Exit } from 'effect';
import { regateRelease, releaseToRegate } from '../scripts/sdk-release/batch';
import {
  APP_SLUG,
  fakeController,
  head,
  merge,
  type ControllerOptions,
} from './sdk-release-controller-fixture';
import { json, readText, runRelease } from './sdk-release-harness';

/** Regate as the workflow runs it: `next` at batch 8's merge commit, dispatched by the requester. */
const regate = (fetcher: ReturnType<typeof fakeController>['fetcher'], actor = 'requester') =>
  runRelease(
    Effect.exit(
      Effect.flatMap(releaseToRegate(actor, merge), ({ pull, batch }) =>
        regateRelease(pull, batch, APP_SLUG)
      )
    ),
    fetcher
  );

const pull = 'https://github.com/ComposioHQ/composio/pull/9';
const tagged = Exit.succeed({ _tag: 'Tagged', tag: 'sdk-release/8' } as const);
const controller = (options: ControllerOptions = {}) => fakeController(options);

describe('regate', () => {
  test('tags the merged, untagged release on next at its reviewed head', async () => {
    const github = controller();
    expect(await regate(github.fetcher)).toEqual(tagged);
    expect(github.writes).toEqual([
      { method: 'POST', path: '/git/refs', body: { ref: 'refs/tags/sdk-release/8', sha: head } },
    ]);
  });

  test('reports Tagged without writing when the tag is already on the reviewed head', async () => {
    const github = controller({ existingTag: head });
    expect(await regate(github.fetcher)).toEqual(tagged);
    expect(github.writes).toEqual([]);
  });

  test("leaves an already-tagged release alone, even one today's gate would refuse", async () => {
    const github = controller({ existingTag: head, docs: 'missing' });
    expect(await regate(github.fetcher)).toEqual(tagged);
    expect(github.writes).toEqual([]);
  });

  test('refuses a tag that points at another commit', async () => {
    const github = controller({ existingTag: merge });
    expect(String(await regate(github.fetcher))).toContain('already points to another source');
    expect(github.writes).toEqual([]);
  });

  test('fails with nothing to re-gate when next carries no release plan', async () => {
    const github = controller({ noPlanOnNext: true });
    expect(String(await regate(github.fetcher))).toContain('Nothing to re-gate');
    expect(github.writes).toEqual([]);
  });

  test('reports a release PR closed without merging as abandoned', async () => {
    const github = controller({ closedUnmerged: true });
    expect(await regate(github.fetcher)).toEqual(Exit.succeed({ _tag: 'Abandoned', pull }));
    expect(github.writes).toEqual([]);
  });

  test('refuses a release that fails the gate, exactly as the tag job does', async () => {
    const github = controller({ oldReview: true });
    expect(await regate(github.fetcher)).toEqual(
      Exit.succeed({ _tag: 'Refused', pull, reason: expect.stringContaining('lacks an approval') })
    );
    expect(github.writes.map(write => write.path)).toEqual(['/issues/9/comments']);
  });

  test('requires an active ComposioHQ member', async () => {
    const github = controller();
    const outsider: typeof github.fetcher = (input, init) =>
      new URL(String(input)).pathname === '/orgs/ComposioHQ/memberships/outsider'
        ? Promise.resolve(json({ message: 'Not Found' }, 404))
        : github.fetcher(input, init);
    expect(String(await regate(outsider, 'outsider'))).toContain('(404)');
    expect(github.writes).toEqual([]);
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
