import { Effect, Option, Schema, Stream } from 'effect';
import {
  CONTENT_CONCURRENCY,
  PositiveInt,
  REPOSITORY_PATH,
  Sha,
  fileAt,
  paginate,
  paginateArray,
  request,
} from './github';
import { PullDetail, isReleasePull, releaseBranch } from './release-pr';
import { ensure, fail } from './runtime';
import { BATCH_PATH, ReleaseBatch, batchLanguages, channelOf } from './source';

const WRITE_PERMISSIONS = new Set(['write', 'maintain', 'admin']);
const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);

export interface Review {
  readonly user: string;
  readonly state: string;
  readonly commitId: string;
  readonly permission: string;
}

/**
 * A writer who is not excluded (the PR author and the requester) approved this exact head, and
 * no writer's latest review requests changes.
 */
export function eligibleApproval(
  reviews: ReadonlyArray<Review>,
  excluded: ReadonlyArray<string>,
  head: string
) {
  const latest = [...new Map(reviews.map(review => [review.user, review])).values()];
  const writers = latest.filter(review => WRITE_PERMISSIONS.has(review.permission));
  return (
    !writers.some(review => review.state === 'CHANGES_REQUESTED') &&
    writers.some(
      review =>
        !excluded.includes(review.user) && review.state === 'APPROVED' && review.commitId === head
    )
  );
}

export const PullReview = Schema.Struct({
  user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
  state: Schema.String,
  commit_id: Sha,
});
export const CollaboratorPermission = Schema.Struct({ permission: Schema.String });
export const CheckRuns = Schema.Struct({
  check_runs: Schema.Array(
    Schema.Struct({
      id: PositiveInt,
      name: Schema.String,
      head_sha: Sha,
      app: Schema.NullOr(Schema.Struct({ slug: Schema.String })),
      conclusion: Schema.NullOr(Schema.String),
    })
  ),
});
export const HeadCommit = Schema.Struct({
  author: Schema.NullOr(Schema.Struct({ login: Schema.String })),
  commit: Schema.Struct({ verification: Schema.Struct({ verified: Schema.Boolean }) }),
  parents: Schema.Array(Schema.Struct({ sha: Sha })),
});

/** Review decisions with each reviewer's repository permission, looked up once per login. */
const reviewsWithPermissions = (number: number) =>
  Effect.gen(function* () {
    // A deleted account's review has `user: null`; it can't be a writer, so it is skipped.
    const decisions = (yield* Stream.runCollect(
      paginateArray(`${REPOSITORY_PATH}/pulls/${number}/reviews`, PullReview)
    )).flatMap(({ user, state, commit_id }) =>
      user !== null && REVIEW_STATES.has(state)
        ? [{ user: user.login, state, commitId: commit_id }]
        : []
    );
    const logins = [...new Set(decisions.map(review => review.user))];
    const permissions = new Map(
      yield* Effect.forEach(
        logins,
        login =>
          Effect.map(
            request(
              'GET',
              `${REPOSITORY_PATH}/collaborators/${encodeURIComponent(login)}/permission`,
              CollaboratorPermission
            ),
            result => [login, result.permission] as const
          ),
        { concurrency: CONTENT_CONCURRENCY }
      )
    );
    return decisions.map(
      review => ({ ...review, permission: permissions.get(review.user) ?? '' }) satisfies Review
    );
  });

/** A release PR into next and the plan committed on its head. */
export const readReleasePull = (number: number) =>
  Effect.gen(function* () {
    const pull = yield* request('GET', `${REPOSITORY_PATH}/pulls/${number}`, PullDetail);
    yield* ensure(
      pull.base.ref === 'next' && isReleasePull(pull),
      'Expected an SDK release PR into protected next'
    );
    const raw = yield* fileAt(BATCH_PATH, pull.head.sha);
    if (Option.isNone(raw)) return yield* fail('Missing committed release plan');
    const batch = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseBatch))(raw.value);
    yield* ensure(
      pull.head.ref === releaseBranch(batch.id),
      'Release branch and batch do not agree'
    );
    return { pull, batch };
  });

const ZERO_SHA = '0'.repeat(40);
export const BranchActivity = Schema.Struct({
  after: Sha,
  actor: Schema.NullOr(Schema.Struct({ login: Schema.String })),
});

/**
 * Whether `sha` is the release App's own verified commit on the planned source, and the App set
 * the release branch to it last. GitHub commits and signs every API-made commit as `web-flow`,
 * and any writer can make one that names the App as author, so only the branch's activity log,
 * newest first, shows who moved it.
 */
export const isReleaseAppCommit = (sha: string, batch: ReleaseBatch, appSlug: string) =>
  Effect.gen(function* () {
    const head = yield* request('GET', `${REPOSITORY_PATH}/commits/${sha}`, HeadCommit);
    const activity = yield* request(
      'GET',
      `${REPOSITORY_PATH}/activity?ref=${encodeURIComponent(`refs/heads/${releaseBranch(batch.id)}`)}&direction=desc&per_page=100`,
      Schema.Array(BranchActivity)
    );
    const lastSet = activity.find(entry => entry.after !== ZERO_SHA);
    return (
      head.author?.login === `${appSlug}[bot]` &&
      head.commit.verification.verified &&
      head.parents.length === 1 &&
      head.parents[0].sha === batch.inputBase &&
      lastSet?.after === sha &&
      lastSet.actor?.login === `${appSlug}[bot]`
    );
  });

export const isReleaseAppHead = (pull: PullDetail, batch: ReleaseBatch, appSlug: string) =>
  isReleaseAppCommit(pull.head.sha, batch, appSlug);

export const IssueEvent = Schema.Struct({ event: Schema.String, commit_id: Schema.NullOr(Sha) });

/** The commit a merged PR left on its base. Pull responses no longer carry `merge_commit_sha`. */
export const mergeCommitOf = (number: number) =>
  Effect.gen(function* () {
    const events = yield* Stream.runCollect(
      paginateArray(`${REPOSITORY_PATH}/issues/${number}/events`, IssueEvent)
    );
    const sha = events.findLast(event => event.event === 'merged')?.commit_id;
    if (!sha) return yield* fail('The merged release PR has no merge commit');
    return sha;
  });

/**
 * The request issue named by a release PR's plan, only when the release App committed that plan.
 * Anyone with write access can push a `sdk-release/batch-*` branch, so its plan cannot pick the
 * issue the bot comments on, labels and closes.
 */
export const trustedIssue = (pull: PullDetail, batch: ReleaseBatch, appSlug: string) =>
  Effect.map(isReleaseAppHead(pull, batch, appSlug), trusted =>
    trusted ? Option.some(batch.issue) : Option.none<number>()
  );

/**
 * The checks a release PR must pass before its head is tagged:
 * - the head is the release App's own commit on the frozen source, so nobody added changes the
 *   release-only diff check did not see;
 * - a writer other than the author and the requester approved that head;
 * - the candidate build and smoke checks passed on it, and the docs check for a stable release.
 */
export const verifyReleaseGate = (pull: PullDetail, batch: ReleaseBatch, appSlug: string) =>
  Effect.gen(function* () {
    yield* ensure(
      yield* isReleaseAppHead(pull, batch, appSlug),
      'The release PR head must be the release App commit on the planned source; request a new release instead of pushing to its branch'
    );
    const reviews = yield* reviewsWithPermissions(pull.number);
    yield* ensure(
      eligibleApproval(
        reviews,
        [pull.user?.login ?? '', batch.requestedBy].filter(Boolean),
        pull.head.sha
      ),
      'Final release head lacks an approval from a writer other than the author and requester'
    );
    // A release head that touches every SDK runs more than one page of checks.
    const checks = yield* Stream.runCollect(
      paginate(
        `${REPOSITORY_PATH}/commits/${pull.head.sha}/check-runs`,
        CheckRuns,
        body => body.check_runs
      )
    );
    // A re-run adds a newer check run under the same name; only the newest one counts.
    const latest = new Map<string, (typeof checks)[number]>();
    for (const check of checks)
      if (
        check.head_sha === pull.head.sha &&
        check.app?.slug === 'github-actions' &&
        check.id > (latest.get(check.name)?.id ?? 0)
      )
        latest.set(check.name, check);
    const passed = (name: string) => latest.get(name)?.conclusion === 'success';
    for (const language of batchLanguages(batch))
      for (const check of [`SDK candidate (${language})`, `SDK candidate smoke (${language})`])
        yield* ensure(passed(check), `Missing green final-head check: ${check}`);
    for (const check of channelOf(batch).extraChecks)
      yield* ensure(passed(check), `Missing green final-head check: ${check}`);
  });
