import { describe, expect, test } from 'bun:test';
import { eligibleApproval } from '../scripts/sdk-release/approval';
import { authorizeSourceTag } from '../scripts/sdk-release/batch';
import {
  base,
  fakeController,
  head,
  merge,
  type ControllerOptions,
} from './sdk-release-controller-fixture';
import { runRelease } from './sdk-release-harness';

describe('release approval rule', () => {
  const excluded = ['author', 'requester'];
  const review = { user: 'reviewer', state: 'APPROVED', commitId: head, permission: 'write' };

  test('a head-commit approval by a writer who is neither author nor requester passes', () => {
    expect(eligibleApproval([review], excluded, head)).toBe(true);
    expect(
      eligibleApproval(
        [review, { ...review, user: 'observer', state: 'CHANGES_REQUESTED', permission: 'read' }],
        excluded,
        head
      )
    ).toBe(true);
  });

  test('requester, author, older-commit, read-permission and overridden approvals fail', () => {
    expect(eligibleApproval([{ ...review, user: 'requester' }], excluded, head)).toBe(false);
    expect(eligibleApproval([{ ...review, user: 'author' }], excluded, head)).toBe(false);
    expect(eligibleApproval([{ ...review, commitId: base }], excluded, head)).toBe(false);
    expect(eligibleApproval([{ ...review, permission: 'read' }], excluded, head)).toBe(false);
    expect(
      eligibleApproval([review, { ...review, state: 'CHANGES_REQUESTED' }], excluded, head)
    ).toBe(false);
  });
});

const tagWrites = (writes: ReadonlyArray<{ path: string }>) =>
  writes.filter(write => write.path === '/git/refs');

describe('source tag', () => {
  test('a merged, approved release tags the approved head for merge and squash commits', async () => {
    for (const mergeKind of ['merge', 'squash'] as const) {
      const { fetcher, writes } = await fakeController({ mergeKind });
      expect(await runRelease(authorizeSourceTag(9, 123), fetcher)).toBe('sdk-release/8');
      expect(writes).toEqual([
        { path: '/git/refs', body: { ref: 'refs/tags/sdk-release/8', sha: head } },
      ]);
    }
  });

  test('a release PR closed without merging creates no tag, even with a valid approval', async () => {
    const { fetcher, writes } = await fakeController({ closedUnmerged: true });
    await expect(runRelease(authorizeSourceTag(9, 123), fetcher)).rejects.toThrow(
      'Release PR has not merged'
    );
    expect(writes).toEqual([]);
  });

  test('the requester approving their own merged release creates no tag and explains the fix', async () => {
    const { fetcher, writes } = await fakeController({ reviewer: 'requester' });
    await expect(runRelease(authorizeSourceTag(9, 123), fetcher)).rejects.toThrow(
      'lacks an approval from a writer other than the author and requesters'
    );
    expect(tagWrites(writes)).toEqual([]);
    expect(writes.map(write => write.path)).toEqual(['/issues/9/comments', '/issues/8/comments']);
    for (const write of writes) {
      const { body } = write.body as { body: string };
      expect(body).toContain(
        'lacks an approval from a writer other than the author and requesters'
      );
      expect(body).toContain('Revert this release PR on next, then request the release again.');
    }
  });

  test('every failing gate after merge comments once on the PR and the request and creates no tag', async () => {
    const failing: ReadonlyArray<ControllerOptions> = [
      { oldReview: true },
      { failedCandidate: true },
      { editedPlan: true },
      { docs: 'failure' },
      { docs: 'pending' },
      { docs: 'missing' },
    ];
    for (const options of failing) {
      const { fetcher, writes } = await fakeController(options);
      await expect(runRelease(authorizeSourceTag(9, 123), fetcher)).rejects.toThrow();
      expect(writes.map(write => write.path)).toEqual(['/issues/9/comments', '/issues/8/comments']);
    }
  });

  test('an existing matching tag is reused and a tag on another commit is refused', async () => {
    const matching = await fakeController({ existingTag: head });
    expect(await runRelease(authorizeSourceTag(9, 123), matching.fetcher)).toBe('sdk-release/8');
    expect(matching.writes).toEqual([]);
    const moved = await fakeController({ existingTag: merge });
    await expect(runRelease(authorizeSourceTag(9, 123), moved.fetcher)).rejects.toThrow(
      'another source'
    );
    expect(moved.writes).toEqual([]);
  });
});
