import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { eligibleApproval, readReleasePull, trustedIssue } from '../scripts/sdk-release/approval';
import { authorizeSourceTag } from '../scripts/sdk-release/batch';
import {
  APP_SLUG,
  base,
  fakeController,
  head,
  merge,
  type ControllerOptions,
} from './sdk-release-controller-fixture';
import { runRelease } from './sdk-release-harness';

const tag = (fetcher: ReturnType<typeof fakeController>['fetcher']) =>
  runRelease(
    Effect.flatMap(readReleasePull(9), ({ pull, batch }) =>
      authorizeSourceTag(pull, batch, APP_SLUG)
    ),
    fetcher
  );
const pull = 'https://github.com/ComposioHQ/composio/pull/9';
const tagged = { _tag: 'Tagged', tag: 'sdk-release/8' } as const;
const tagWrite = {
  method: 'POST',
  path: '/git/refs',
  body: { ref: 'refs/tags/sdk-release/8', sha: head },
};
const commentBodies = (writes: ReadonlyArray<{ body: unknown }>) =>
  writes.map(write => (write.body as { body: string }).body);

describe('release approval rule', () => {
  const excluded = ['author', 'requester'];
  const review = { user: 'reviewer', state: 'APPROVED', commitId: head, permission: 'write' };

  test.each([
    ['a writer who is neither author nor requester', [review], true],
    [
      'a writer, despite a reader requesting changes',
      [review, { ...review, user: 'observer', state: 'CHANGES_REQUESTED', permission: 'read' }],
      true,
    ],
    ['the requester', [{ ...review, user: 'requester' }], false],
    ['the author', [{ ...review, user: 'author' }], false],
    ['an approval of an older commit', [{ ...review, commitId: base }], false],
    ['a reader', [{ ...review, permission: 'read' }], false],
    ['an approval later overridden', [review, { ...review, state: 'CHANGES_REQUESTED' }], false],
    [
      'an approval while another writer requests changes',
      [review, { ...review, user: 'maintainer', state: 'CHANGES_REQUESTED' }],
      false,
    ],
  ])('%s → %p', (_name, reviews, expected) => {
    expect(eligibleApproval(reviews, excluded, head)).toBe(expected);
  });
});

describe('source tag', () => {
  test.each(['merge', 'squash'] as const)(
    'a merged, approved release tags the reviewed head (%s merge)',
    async mergeKind => {
      const { fetcher, writes } = fakeController({ mergeKind });
      expect(await tag(fetcher)).toEqual(tagged);
      expect(writes).toEqual([tagWrite]);
    }
  );

  test('required checks on a later page of more than 100 check runs still tag the head', async () => {
    const { fetcher, writes } = fakeController();
    const unrelated = Array.from({ length: 100 }, (_, index) => ({
      name: `matrix job ${index}`,
      head_sha: head,
      app: { slug: 'github-actions' },
      conclusion: 'success',
    }));
    const paged: typeof fetcher = (input, init) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('/check-runs')) return fetcher(input, init);
      return (url.searchParams.get('page') ?? '1') === '1'
        ? Promise.resolve(Response.json({ total_count: 103, check_runs: unrelated }))
        : fetcher(input, init);
    };
    expect(await tag(paged)).toEqual(tagged);
    expect(writes).toEqual([tagWrite]);
  });

  test("a deleted account's review is skipped and the approved head is still tagged", async () => {
    const { fetcher, writes } = fakeController({ deletedReviewer: true });
    expect(await tag(fetcher)).toEqual(tagged);
    expect(writes).toEqual([tagWrite]);
  });

  test("only the release App's plan may name the request issue the status job writes to", async () => {
    const issueOf = (options: Parameters<typeof fakeController>[0]) => {
      const { fetcher } = fakeController(options);
      return runRelease(
        Effect.flatMap(readReleasePull(9), ({ pull, batch }) =>
          trustedIssue(pull, batch, APP_SLUG)
        ),
        fetcher
      );
    };
    expect(await issueOf({})).toEqual(Option.some(8));
    expect(await issueOf({ closedUnmerged: true, headAuthor: 'writer' })).toEqual(Option.none());
    expect(await issueOf({ headCommitter: 'writer' })).toEqual(Option.none());
  });

  test('a beta is tagged without the docs check, which never runs on a plan-only PR', async () => {
    const { fetcher, writes } = fakeController({ beta: true, docs: 'missing' });
    expect(await tag(fetcher)).toEqual(tagged);
    expect(writes).toEqual([tagWrite]);
  });

  test('a release PR closed without merging is abandoned and creates no tag', async () => {
    const { fetcher, writes } = fakeController({ closedUnmerged: true });
    expect(await tag(fetcher)).toEqual({ _tag: 'Abandoned', pull });
    expect(writes).toEqual([]);
  });

  test.each<[string, ControllerOptions, string]>([
    ['the requester approves', { reviewer: 'requester' }, 'lacks an approval'],
    ['the approval is for an older head', { oldReview: true }, 'lacks an approval'],
    ['a human pushed the head', { headAuthor: 'writer' }, 'release App commit'],
    [
      'a human committed a head that names the App as author',
      { headCommitter: 'writer' },
      'release App commit',
    ],
    ['the head commit is unverified', { unverifiedHead: true }, 'release App commit'],
    ['the head is not on the planned source', { headParent: merge }, 'release App commit'],
    ['the candidate build failed', { failedCandidate: true }, 'SDK candidate (typescript)'],
    ['the smoke test failed', { failedSmoke: true }, 'SDK candidate smoke (typescript)'],
    ['the docs check failed', { docs: 'failure' }, 'typescript-check'],
    ['the docs check is pending', { docs: 'pending' }, 'typescript-check'],
    ['the docs check is missing', { docs: 'missing' }, 'typescript-check'],
  ])(
    'when %s, the release is refused, no tag is created and the PR is told to revert',
    async (_name, options, reason) => {
      const { fetcher, writes } = fakeController(options);
      expect(await tag(fetcher)).toEqual({
        _tag: 'Refused',
        pull,
        reason: expect.stringContaining(reason),
      });
      expect(writes.map(write => write.path)).toEqual(['/issues/9/comments']);
      for (const body of commentBodies(writes)) {
        expect(body).toContain(reason);
        expect(body).toContain('Revert it on `next`');
      }
    }
  );

  test('a GitHub error during the gate fails the job for a re-run and refuses nothing', async () => {
    const { fetcher, writes } = fakeController();
    const unavailable: typeof fetcher = (input, init) =>
      new URL(String(input)).pathname.includes('/check-runs')
        ? Promise.resolve(new Response('Bad Gateway', { status: 502 }))
        : fetcher(input, init);
    await expect(tag(unavailable)).rejects.toThrow('(502)');
    expect(writes).toEqual([]);
  });

  test('an existing matching tag is reused and a tag on another commit is refused', async () => {
    const matching = fakeController({ existingTag: head });
    expect(await tag(matching.fetcher)).toEqual(tagged);
    expect(matching.writes).toEqual([]);
    const moved = fakeController({ existingTag: merge });
    await expect(tag(moved.fetcher)).rejects.toThrow('another source');
    expect(moved.writes).toEqual([]);
  });
});
