import { beforeAll, describe, expect, test } from 'bun:test';
import { Effect, Exit, Schema } from 'effect';
import {
  BranchActivity,
  CheckRuns,
  CollaboratorPermission,
  HeadCommit,
  IssueEvent,
  PullReview,
  readReleasePull,
} from '../scripts/sdk-release/approval';
import { ActionArtifact, ArtifactsPage } from '../scripts/sdk-release/artifacts';
import { GitCommit, authorizeSourceTag } from '../scripts/sdk-release/batch';
import { WorkflowRuns } from '../scripts/sdk-release/candidates';
import {
  GITHUB_API_VERSION,
  JobsPage,
  REPOSITORY_PATH,
  TagRef,
} from '../scripts/sdk-release/github';
import type { Recording } from '../scripts/sdk-release/record-github-fixtures';
import { PullDetail, PullListItem } from '../scripts/sdk-release/release-pr';
import { ReleaseBatch } from '../scripts/sdk-release/source';
import { candidateRoutes, fakeController, head, merge } from './sdk-release-controller-fixture';
import { json, runRelease } from './sdk-release-harness';
import {
  RELEASE_5278,
  loadRecordings,
  recordedShape,
  replay,
  unrecordedPaths,
  type Override,
} from './sdk-release-github-recordings';

/** The production schema that reads each recorded endpoint. */
const CONTRACTS: Record<string, Schema.Decoder<unknown>> = {
  PullDetail,
  PullList: Schema.Array(PullListItem),
  ReleasePlan: Schema.fromJsonString(ReleaseBatch),
  HeadCommit,
  BranchActivity: Schema.Array(BranchActivity),
  PullReviews: Schema.Array(PullReview),
  CollaboratorPermission,
  CheckRuns,
  IssueEvents: Schema.Array(IssueEvent),
  GitCommit,
  GitRef: TagRef,
  WorkflowRuns,
  Jobs: JobsPage,
  Artifacts: ArtifactsPage,
  Artifact: ActionArtifact,
};

let recordings: ReadonlyArray<Recording> = [];
beforeAll(async () => {
  recordings = await loadRecordings();
});

const shapeOf = (contract: string) =>
  recordedShape(
    recordings.filter(recording => recording.contract === contract).map(({ body }) => body)
  );

describe('recorded GitHub responses', () => {
  test('cover every contract and were recorded under the pinned API version', () => {
    expect(new Set(recordings.map(recording => recording.contract))).toEqual(
      new Set(Object.keys(CONTRACTS))
    );
    for (const recording of recordings) expect(recording.apiVersion).toBe(GITHUB_API_VERSION);
  });

  test('decode through the production schemas', () => {
    for (const recording of recordings) {
      const decoded = Schema.decodeUnknownExit(CONTRACTS[recording.contract])(recording.body);
      expect({ path: recording.path, ok: Exit.isSuccess(decoded) }).toEqual({
        path: recording.path,
        ok: true,
      });
    }
  });
});

describe('handwritten GitHub fixtures', () => {
  const read = async (fetcher: ReturnType<typeof fakeController>['fetcher'], path: string) =>
    (await fetcher(`https://api.github.com${REPOSITORY_PATH}${path}`)).json();

  test.each([
    ['PullDetail', '/pulls/9', {}],
    ['PullList', '/pulls?state=open&base=next&per_page=100&page=1', { openRelease: 'x' }],
    ['PullReviews', '/pulls/9/reviews?per_page=100&page=1', {}],
    ['CollaboratorPermission', '/collaborators/reviewer/permission', {}],
    ['CheckRuns', `/commits/${head}/check-runs?per_page=100&page=1`, {}],
    ['HeadCommit', `/commits/${head}`, {}],
    [
      'BranchActivity',
      '/activity?ref=refs%2Fheads%2Fsdk-release%2Fbatch-8&direction=desc&per_page=100',
      {},
    ],
    ['IssueEvents', '/issues/9/events?per_page=100&page=1', {}],
    ['GitCommit', `/git/commits/${merge}`, {}],
    ['GitRef', '/git/ref/heads/next', {}],
    ['GitRef', '/git/ref/tags/sdk-release/8', { existingTag: head }],
  ] as const)(
    'the release controller fixture sends only recorded %s fields (%s)',
    async (contract, path, options) => {
      const body = await read(fakeController(options).fetcher, path);
      expect(unrecordedPaths(body, shapeOf(contract))).toEqual([]);
    }
  );

  test('the candidate pinning fixture sends only recorded fields', () => {
    const routes = candidateRoutes(`sha256:${'0'.repeat(64)}`);
    const contracts: Record<string, string> = {
      [`/commits/${head}`]: 'HeadCommit',
      '/activity': 'BranchActivity',
      '/actions/workflows/sdk.release.candidates.yml/runs': 'WorkflowRuns',
      '/actions/runs/41/jobs': 'Jobs',
      '/actions/runs/41/artifacts': 'Artifacts',
    };
    expect(Object.keys(routes).toSorted()).toEqual(Object.keys(contracts).toSorted());
    for (const [route, body] of Object.entries(routes))
      expect({ route, unrecorded: unrecordedPaths(body, shapeOf(contracts[route])) }).toEqual({
        route,
        unrecorded: [],
      });
  });

  test('a field GitHub does not send on list items is caught', () => {
    const listed = { number: 9, merged: false, merge_commit_sha: null };
    expect(unrecordedPaths([listed], shapeOf('PullList'))).toEqual([
      '$[0].merged',
      '$[0].merge_commit_sha',
    ]);
  });
});

describe('the tag gate on release #5278', () => {
  const tag = (fetcher: ReturnType<typeof replay>['fetcher']) =>
    runRelease(
      Effect.exit(
        Effect.flatMap(readReleasePull(RELEASE_5278.pull), ({ pull, batch }) =>
          authorizeSourceTag(pull, batch, RELEASE_5278.appSlug)
        )
      ),
      fetcher
    );
  const tagPath = `/git/ref/tags/sdk-release/${RELEASE_5278.id}`;
  /**
   * #5278 ran before the `SDK candidate docs` job existed, so its recorded checks lack it. The
   * recorded `typescript-check` run stands in for it, under the new name and a newer id.
   */
  const withCandidateDocs: Record<string, Override> = {
    [`/commits/${RELEASE_5278.head}/check-runs?per_page=100&page=2`]: recorded => {
      const body = recorded as { check_runs: ReadonlyArray<{ id: number; name: string }> };
      const docs = body.check_runs.find(check => check.name === 'typescript-check');
      return json({
        ...body,
        check_runs: [
          ...body.check_runs,
          { ...docs, id: Number(docs?.id) + 1, name: 'SDK candidate docs' },
        ],
      });
    },
  };

  test('tags the reviewed head', async () => {
    const github = replay(recordings, {
      ...withCandidateDocs,
      [tagPath]: () => json({ message: 'Not Found' }, 404),
    });
    expect(await tag(github.fetcher)).toEqual(
      Exit.succeed({ _tag: 'Tagged', tag: `sdk-release/${RELEASE_5278.id}` })
    );
    expect(github.writes).toEqual([
      {
        method: 'POST',
        path: '/git/refs',
        body: { ref: `refs/tags/sdk-release/${RELEASE_5278.id}`, sha: RELEASE_5278.head },
      },
    ]);
  });

  test('accepts the tag it already created on that head without writing', async () => {
    const github = replay(recordings, withCandidateDocs);
    expect(await tag(github.fetcher)).toEqual(
      Exit.succeed({ _tag: 'Tagged', tag: `sdk-release/${RELEASE_5278.id}` })
    );
    expect(github.writes).toEqual([]);
  });

  test('a pull without `merged` is a contract failure, not an abandoned release', async () => {
    const github = replay(recordings, {
      [`/pulls/${RELEASE_5278.pull}`]: recorded => {
        const { merged: _merged, ...rest } = recorded as Record<string, unknown>;
        return json(rest);
      },
    });
    const exit = await tag(github.fetcher);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(Exit.isFailure(exit) && exit.cause)).toContain('merged');
    expect(String(Exit.isFailure(exit) && exit.cause)).toContain(`/pulls/${RELEASE_5278.pull}`);
    expect(github.writes).toEqual([]);
  });
});
