import { Effect, Option, Schema, Stream } from 'effect';
import {
  candidateArtifactName,
  isRetained,
  originalCandidates,
  publisherStarted,
  type CandidateArtifact,
} from './artifacts';
import {
  REPOSITORY_PATH,
  ReleaseRun,
  SDK_RELEASE_REPOSITORY,
  decodeBase64Content,
  jobs,
  paginate,
  request,
  requestOptional,
  type ReleaseJob,
} from './github';
import { ensure, fail } from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';

const WORKFLOW_PATH = '.github/workflows/sdk.release.yml';
const RELEASE_PR_MARKER = '<!-- sdk-release-batch -->';
const MAX_RUN_ATTEMPTS = 50;
const RECOVERY_WINDOW_MS = 30 * 86_400_000;
const AUTHORIZED_BATCH_ARTIFACT = 'sdk-authorized-batch';

const FileContent = Schema.Struct({ encoding: Schema.Literal('base64'), content: Schema.String });

const belongsToReleaseWorkflow = (run: ReleaseRun) =>
  run.path === WORKFLOW_PATH && run.repository.full_name === SDK_RELEASE_REPOSITORY;
const recoveryWindowClosed = (run: ReleaseRun, now: number) =>
  now >= Date.parse(run.created_at) + RECOVERY_WINDOW_MS;
const attemptsExhausted = (run: ReleaseRun) =>
  run.run_attempt >= MAX_RUN_ATTEMPTS && run.status === 'completed';

/** The release batch committed at `ref`, or `None` when that ref has no batch file. */
export const committedBatch = (ref: string) =>
  Effect.gen(function* () {
    const file = yield* requestOptional(
      `${REPOSITORY_PATH}/contents/${BATCH_PATH}?ref=${ref}`,
      FileContent
    );
    if (Option.isNone(file)) return Option.none<ReleaseBatch>();
    const contents = yield* decodeBase64Content(file.value.content);
    return Option.some(
      yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseBatch))(contents)
    );
  });

/** The single protected source-tag run that publishes this batch, if it started. */
export const sourceTagRun = (batch: ReleaseBatch) =>
  Effect.gen(function* () {
    const branch = `sdk-release/${batch.id}`;
    const runs = yield* request(
      'GET',
      `${REPOSITORY_PATH}/actions/workflows/sdk.release.yml/runs?event=push&branch=${encodeURIComponent(branch)}&per_page=100`,
      Schema.Struct({
        total_count: Schema.Number.check(Schema.isLessThanOrEqualTo(100)),
        workflow_runs: Schema.Array(ReleaseRun),
      })
    );
    const original = runs.workflow_runs.filter(
      run => run.head_branch === branch && belongsToReleaseWorkflow(run)
    );
    yield* ensure(
      original.length <= 1,
      'Multiple source-tag runs identify the same immutable release'
    );
    return Option.fromNullishOr(original[0]);
  });

const PreparationPull = Schema.Struct({
  body: Schema.NullOr(Schema.String),
  head: Schema.Struct({
    sha: Schema.String,
    ref: Schema.String,
    repo: Schema.NullOr(Schema.Struct({ full_name: Schema.String })),
  }),
});

/** The batch a preparation run committed to its release PR, if that PR exists. */
export const batchForPreparation = (runId: string) =>
  Effect.gen(function* () {
    const branch = `sdk-release/batch-${runId}`;
    const pulls = yield* request(
      'GET',
      `${REPOSITORY_PATH}/pulls?state=all&base=next&head=ComposioHQ:${branch}&per_page=100`,
      Schema.Array(PreparationPull)
    );
    const release = pulls.filter(
      pull =>
        pull.head.ref === branch &&
        pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY &&
        pull.body?.includes(RELEASE_PR_MARKER) === true
    );
    yield* ensure(release.length <= 1, 'Multiple PRs identify the original preparation');
    if (!release[0]) return Option.none<ReleaseBatch>();
    const batch = yield* committedBatch(release[0].head.sha);
    yield* ensure(
      Option.isNone(batch) || (batch.value.id === runId && batch.value.originalRunId === runId),
      'Original preparation and release PR identity differ'
    );
    return batch;
  });

const PUBLICATION_TAG = /^sdk-release\/\d+$/;
const VERIFY_JOB = 'Verify public SDK packages';
const RECOVERY_EXHAUSTED_STEP = 'Registry recovery exhausted';

/** Whether the preparation run's authorization artifact can no longer back a retry. */
const authorizationLost = (batch: ReleaseBatch, now: number) =>
  originalCandidates(Number(batch.originalRunId)).pipe(
    Effect.map(artifacts => {
      const authorized = artifacts.filter(artifact => artifact.name === AUTHORIZED_BATCH_ARTIFACT);
      const [only] = authorized;
      return (
        authorized.length !== 1 ||
        only.workflow_run.id !== Number(batch.originalRunId) ||
        only.workflow_run.head_sha !== batch.inputBase ||
        !isRetained(only, now)
      );
    }),
    Effect.catchTag('GitHubApiError', error =>
      error.status === 404 ? Effect.succeed(true) : Effect.fail(error)
    )
  );

const candidateLost = (
  batch: ReleaseBatch,
  artifacts: ReadonlyArray<CandidateArtifact>,
  now: number
) =>
  batch.plan.releases.some(
    release =>
      !artifacts.some(
        artifact =>
          artifact.name === candidateArtifactName(release.language) && isRetained(artifact, now)
      )
  );

export interface PublicationState {
  readonly verified: boolean;
  readonly terminal: boolean;
  readonly jobs: ReadonlyArray<ReleaseJob>;
  readonly terminalReason?: string;
}

/** Whether an original publication run verified its packages, or can no longer recover. */
export const publicationState = (run: ReleaseRun) =>
  Effect.gen(function* () {
    yield* ensure(
      belongsToReleaseWorkflow(run) &&
        run.event === 'push' &&
        PUBLICATION_TAG.test(run.head_branch ?? '') &&
        run.head_sha !== undefined,
      'Expected the original protected publication tag run'
    );
    const headSha = run.head_sha ?? '';
    const batch = yield* committedBatch(headSha);
    if (Option.isNone(batch) || run.head_branch !== `sdk-release/${batch.value.id}`)
      return yield* fail('Publication run and frozen batch differ');
    const tag = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/ref/tags/${run.head_branch}`,
      Schema.Struct({ object: Schema.Struct({ type: Schema.String, sha: Schema.String }) })
    );
    yield* ensure(
      tag.object.type === 'commit' && tag.object.sha === headSha,
      'Original immutable publication tag moved'
    );
    const runJobs = yield* jobs(String(run.id));
    const verified = runJobs.some(job => job.name === VERIFY_JOB && job.conclusion === 'success');
    const settled = !verified && run.status === 'completed';
    const now = Date.now();
    const lostCandidate =
      settled && publisherStarted(runJobs)
        ? candidateLost(batch.value, yield* originalCandidates(run.id), now)
        : false;
    const lostAuthorization = settled ? yield* authorizationLost(batch.value, now) : false;
    const recoveryExhausted = runJobs.some(job =>
      job.steps.some(step => step.name === RECOVERY_EXHAUSTED_STEP && step.conclusion === 'success')
    );
    const terminal =
      !verified &&
      (lostAuthorization ||
        lostCandidate ||
        attemptsExhausted(run) ||
        recoveryWindowClosed(run, now) ||
        recoveryExhausted);
    return {
      verified,
      terminal,
      jobs: runJobs,
      ...(lostAuthorization
        ? {
            terminalReason:
              'Original preparation authorization is unavailable. Request a newly approved higher-version corrective release.',
          }
        : {}),
    } satisfies PublicationState;
  });

const PREPARATION_EVENTS = new Set(['issues', 'workflow_dispatch']);

/** A preparation run may still allocate versions until its release PR exists. */
const isUnfinishedPreparation = (run: ReleaseRun) =>
  Effect.gen(function* () {
    const runJobs = yield* jobs(String(run.id));
    if (runJobs.some(job => job.name === 'release-pr' && job.conclusion === 'success'))
      return false;
    if (Option.isSome(yield* batchForPreparation(String(run.id)))) return false;
    return (yield* originalCandidates(run.id)).some(
      artifact => artifact.name === AUTHORIZED_BATCH_ARTIFACT
    );
  });

/** The newest other authorized preparation run that has not opened its release PR yet. */
export const activePreparation = (exceptRun: string) =>
  paginate(
    `${REPOSITORY_PATH}/actions/workflows/sdk.release.yml/runs?branch=next`,
    Schema.Struct({ workflow_runs: Schema.Array(ReleaseRun) }),
    body => body.workflow_runs
  ).pipe(
    Stream.filter(
      run =>
        String(run.id) !== exceptRun &&
        PREPARATION_EVENTS.has(run.event ?? '') &&
        belongsToReleaseWorkflow(run) &&
        !recoveryWindowClosed(run, Date.now()) &&
        !attemptsExhausted(run)
    ),
    Stream.filterEffect(isUnfinishedPreparation),
    Stream.runHead
  );

/** The batch committed on next and the state of its publication. */
export const currentPublication = Effect.gen(function* () {
  const committed = yield* committedBatch('next');
  if (Option.isNone(committed)) return Option.none();
  const batch = committed.value;
  const tagRun = yield* sourceTagRun(batch);
  if (Option.isNone(tagRun))
    return Option.some({ batch, run: undefined, active: true, verified: false, terminal: false });
  const run = tagRun.value;
  const tagged =
    run.head_sha === undefined || run.event !== 'push'
      ? Option.none<ReleaseBatch>()
      : yield* committedBatch(run.head_sha);
  yield* ensure(
    Option.isSome(tagged) && JSON.stringify(tagged.value) === JSON.stringify(batch),
    'Original tag run source differs from the committed batch'
  );
  const state = yield* publicationState(run);
  return Option.some({ batch, run, ...state, active: !state.verified && !state.terminal });
});
