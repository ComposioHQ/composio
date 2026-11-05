import { describe, expect, test } from 'bun:test';
import { eligibleApproval } from '../scripts/sdk-release/approval';
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
  runRelease(authorizeSourceTag(9, APP_SLUG), fetcher);
const tagWrite = {
  method: 'POST',
  path: '/git/refs',
  body: { ref: 'refs/tags/sdk-release/8', sha: head },
};
const gateComments = ['/issues/9/comments', '/issues/8/comments'];
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
      expect(await tag(fetcher)).toBe('sdk-release/8');
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
    expect(await tag(paged)).toBe('sdk-release/8');
    expect(writes).toEqual([tagWrite]);
  });

  test('a release PR closed without merging creates no tag', async () => {
    const { fetcher, writes } = fakeController({ closedUnmerged: true });
    await expect(tag(fetcher)).rejects.toThrow('Release PR has not merged');
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
    ['the docs check failed', { docs: 'failure' }, 'docs check'],
    ['the docs check is pending', { docs: 'pending' }, 'docs check'],
    ['the docs check is missing', { docs: 'missing' }, 'docs check'],
  ])(
    'when %s, no tag is created and the PR and request are told to revert',
    async (_name, options, reason) => {
      const { fetcher, writes } = fakeController(options);
      await expect(tag(fetcher)).rejects.toThrow(reason);
      expect(writes.map(write => write.path)).toEqual(gateComments);
      for (const body of commentBodies(writes)) {
        expect(body).toContain(reason);
        expect(body).toContain('Revert this release PR on next');
      }
    }
  );

  test('a GitHub error during the gate asks for a re-run, never a revert', async () => {
    const { fetcher, writes } = fakeController();
    const unavailable: typeof fetcher = (input, init) =>
      new URL(String(input)).pathname.includes('/check-runs')
        ? Promise.resolve(new Response('Bad Gateway', { status: 502 }))
        : fetcher(input, init);
    await expect(tag(unavailable)).rejects.toThrow('(502)');
    expect(writes.map(write => write.path)).toEqual(gateComments);
    for (const body of commentBodies(writes)) {
      expect(body).not.toContain('Revert');
      expect(body).toContain('Re-run failed jobs');
    }
  });

  test('an existing matching tag is reused and a tag on another commit is refused', async () => {
    const matching = fakeController({ existingTag: head });
    expect(await tag(matching.fetcher)).toBe('sdk-release/8');
    expect(matching.writes).toEqual([]);
    const moved = fakeController({ existingTag: merge });
    await expect(tag(moved.fetcher)).rejects.toThrow('another source');
    expect(moved.writes).toEqual([]);
  });
});
