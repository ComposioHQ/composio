import { Effect, FileSystem, Option, Schema, Stream } from 'effect';
import { downloadCandidate, originalCandidates, reuseCandidate } from './artifacts';
import {
  CONTENT_CONCURRENCY,
  REPOSITORY_PATH,
  SDK_RELEASE_REPOSITORY,
  Sha,
  fileAt,
  fileAtOrNull,
  getRun,
  paginateArray,
  request,
} from './github';
import { RELEASE_PR_MARKER } from './release-pr';
import { ensure, fail, readJson } from './runtime';
import { BATCH_PATH, ReleaseBatch, validateReleaseDiff, type ReleaseFile } from './source';

const WORKFLOW_PATH = '.github/workflows/sdk.release.yml';
const AUTHORIZED_BATCH_ARTIFACT = 'sdk-authorized-batch';
const AUTHORIZED_BATCH_FILE = 'sdk-release-batch.json';
const RELEASE_BRANCH = /^sdk-release\/batch-\d+$/;
const WRITE_PERMISSIONS = new Set(['write', 'maintain', 'admin']);
const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);

export const releaseBranch = (id: string) => `sdk-release/batch-${id}`;

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
export const Pull = Schema.Struct({
  number: PositiveInt,
  html_url: Schema.String,
  body: Schema.NullOr(Schema.String),
  state: Schema.String,
  merged: Schema.optionalKey(Schema.Boolean),
  merged_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  merge_commit_sha: Schema.optionalKey(Schema.NullOr(Sha)),
  user: Schema.Struct({ login: Schema.String }),
  head: Schema.Struct({
    sha: Sha,
    ref: Schema.String,
    repo: Schema.NullOr(Schema.Struct({ full_name: Schema.String })),
  }),
  base: Schema.Struct({ ref: Schema.String }),
});
export type Pull = typeof Pull.Type;
export const Compare = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({ filename: Schema.String, status: Schema.String, sha: Sha })
  ).check(Schema.isMaxLength(299)),
});

export const isReleasePull = (pull: Pull) =>
  pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY &&
  RELEASE_BRANCH.test(pull.head.ref) &&
  pull.body?.includes(RELEASE_PR_MARKER) === true;

export interface Review {
  readonly user: string;
  readonly state: string;
  readonly commitId: string;
  readonly permission: string;
}

/**
 * A writer who is not excluded (the PR author and the release requesters) approved this exact
 * head, and no writer's latest review requests changes.
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

/** Downloads a retained authorized-batch artifact into a scoped directory and decodes its plan. */
const downloadAuthorizedBatch = (artifact: Parameters<typeof downloadCandidate>[0]) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'sdk-authorized-plan-' });
      const directory = `${root}/plan`;
      yield* downloadCandidate(artifact, directory);
      return yield* readJson(ReleaseBatch, `${directory}/${AUTHORIZED_BATCH_FILE}`);
    })
  );

/** The committed plan must equal the plan the protected controller authorized and retained. */
const verifyOriginalBatch = (batch: ReleaseBatch) =>
  Effect.gen(function* () {
    const original = yield* getRun(batch.originalRunId);
    yield* ensure(
      original.path === WORKFLOW_PATH &&
        original.repository.full_name === SDK_RELEASE_REPOSITORY &&
        original.head_branch === 'next',
      'Release preparation was not produced by the protected controller'
    );
    const artifact = yield* reuseCandidate(
      yield* originalCandidates(Number(batch.originalRunId)),
      AUTHORIZED_BATCH_ARTIFACT,
      Number(batch.originalRunId),
      batch.inputBase
    );
    if (Option.isNone(artifact))
      return yield* fail('Original authorized release plan is unavailable; prepare a new release');
    const saved = yield* downloadAuthorizedBatch(artifact.value);
    yield* ensure(
      JSON.stringify(saved) === JSON.stringify(batch),
      'Committed release plan differs from the original authorized plan'
    );
  });

const PullReview = Schema.Struct({
  user: Schema.Struct({ login: Schema.String }),
  state: Schema.String,
  commit_id: Sha,
});
const CollaboratorPermission = Schema.Struct({ permission: Schema.String });
const CheckRuns = Schema.Struct({
  total_count: Schema.Number.check(Schema.isLessThanOrEqualTo(100)),
  check_runs: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      head_sha: Sha,
      app: Schema.NullOr(Schema.Struct({ slug: Schema.String })),
      conclusion: Schema.NullOr(Schema.String),
    })
  ),
});

/** Review decisions with each reviewer's repository permission, looked up once per login. */
const reviewsWithPermissions = (number: number) =>
  Effect.gen(function* () {
    const decisions = (yield* Stream.runCollect(
      paginateArray(`${REPOSITORY_PATH}/pulls/${number}/reviews`, PullReview)
    )).filter(review => REVIEW_STATES.has(review.state));
    const logins = [...new Set(decisions.map(review => review.user.login))];
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
      review =>
        ({
          user: review.user.login,
          state: review.state,
          commitId: review.commit_id,
          permission: permissions.get(review.user.login) ?? '',
        }) satisfies Review
    );
  });

/** A release PR into next and the plan committed on its head. */
export const readReleasePull = (number: number) =>
  Effect.gen(function* () {
    const pull = yield* request('GET', `${REPOSITORY_PATH}/pulls/${number}`, Pull);
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

/** The approval rule, final-head checks and release-only diff that every publication requires. */
export const verifyReleaseGate = (pull: Pull, batch: ReleaseBatch) =>
  Effect.gen(function* () {
    yield* verifyOriginalBatch(batch);
    const reviews = yield* reviewsWithPermissions(pull.number);
    yield* ensure(
      eligibleApproval(reviews, [pull.user.login, ...batch.requestedBy], pull.head.sha),
      'Final release head lacks an approval from a writer other than the author and requesters'
    );
    const checks = yield* request(
      'GET',
      `${REPOSITORY_PATH}/commits/${pull.head.sha}/check-runs?per_page=100`,
      CheckRuns
    );
    const passed = (name: string) =>
      checks.check_runs.some(
        check =>
          check.name === name &&
          check.head_sha === pull.head.sha &&
          check.app?.slug === 'github-actions' &&
          check.conclusion === 'success'
      );
    for (const language of new Set(batch.plan.releases.map(release => release.language)))
      yield* ensure(
        passed(`SDK candidate (${language})`),
        `Missing green final-head ${language} candidate check`
      );
    yield* ensure(passed('typescript-check'), 'Missing green final-head production docs check');
    const diff = yield* request(
      'GET',
      `${REPOSITORY_PATH}/compare/${batch.inputBase}...${pull.head.sha}`,
      Compare
    );
    const files = yield* Effect.forEach(
      diff.files,
      file =>
        Effect.map(
          Effect.all([
            fileAtOrNull(file.filename, batch.inputBase),
            fileAtOrNull(file.filename, pull.head.sha),
          ]),
          ([before, after]) => ({ path: file.filename, before, after }) satisfies ReleaseFile
        ),
      { concurrency: CONTENT_CONCURRENCY }
    );
    yield* validateReleaseDiff(files, batch.plan, batch.outputs);
  });

/** Checks a release PR's identity, plan, approval, final-head checks and diff. */
export const verifyReleaseHead = (number: number) =>
  Effect.gen(function* () {
    const release = yield* readReleasePull(number);
    yield* verifyReleaseGate(release.pull, release.batch);
    return release;
  });
