import {
  Cause,
  Config,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Schema,
  Stdio,
  Stream,
} from 'effect';
import { Base64 } from 'effect/encoding';
import { downloadCandidate, originalCandidates, reuseCandidate } from './artifacts';
import {
  currentPublication,
  activePreparation,
  batchForPreparation,
  committedBatch,
  publicationState,
  sourceTagRun,
} from './coordination';
import {
  GitHub,
  REPOSITORY_PATH,
  ReleaseRun,
  RunId,
  SDK_RELEASE_REPOSITORY,
  Sha,
  commentIssue,
  decodeBase64Content,
  getRun,
  jobs,
  paginateArray,
  request,
  requestOptional,
  requireActiveMember,
  rerunFailedJobs,
} from './github';
import { createSdkReleasePlan, type CorrectiveInput, type SdkReleasePlan } from './plan';
import { fetchStableRegistryBaseline } from './registry-baseline';
import { RELEASE_PR_MARKER, releasePullBody } from './release-pr';
import { ReleaseRequest, parseReleaseRequest } from './request';
import { ensure, fail, formatJson, readJson, runMain, type ReleaseServices } from './runtime';
import {
  BATCH_PATH,
  ReleaseBatch,
  ReleasePatch,
  eligibleApproval,
  releaseOutputs,
  validateReleaseDiff,
  type ReleaseFile,
  type Review,
} from './source';

const WORKFLOW_PATH = '.github/workflows/sdk.release.yml';
const RELEASE_BRANCH = /^sdk-release\/batch-\d+$/;
const PUBLICATION_TAG = /^sdk-release\/\d+$/;
const AUTHORIZED_BATCH_ARTIFACT = 'sdk-authorized-batch';
const AUTHORIZED_BATCH_FILE = 'sdk-release-batch.json';
const RETRYABLE_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out']);
const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);
const MAX_RUN_ATTEMPTS = 50;
const RECOVERY_WINDOW_MS = 30 * 86_400_000;
/** Bounded so large release diffs stay under GitHub's secondary rate limit. */
const CONTENT_CONCURRENCY = 8;
const runUrl = (id: string | number) =>
  `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}`;
const releaseBranch = (id: string) => `sdk-release/batch-${id}`;

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const Commit = Schema.Struct({
  sha: Sha,
  tree: Schema.Struct({ sha: Sha }),
  parents: Schema.Array(Schema.Struct({ sha: Sha })),
});
const Pull = Schema.Struct({
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
type Pull = typeof Pull.Type;
const FileContent = Schema.Struct({ encoding: Schema.Literal('base64'), content: Schema.String });
const Compare = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({ filename: Schema.String, status: Schema.String, sha: Sha })
  ).check(Schema.isMaxLength(299)),
});
const CreatedSha = Schema.Struct({ sha: Sha });
const ShaRef = Schema.Struct({ object: Schema.Struct({ sha: Sha }) });
const TagRef = Schema.Struct({ object: Schema.Struct({ type: Schema.String, sha: Sha }) });
const CreatedRef = Schema.Struct({ ref: Schema.String });

const isReleasePull = (pull: Pull) =>
  pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY &&
  RELEASE_BRANCH.test(pull.head.ref) &&
  pull.body?.includes(RELEASE_PR_MARKER) === true;

/** The open release PR into next, optionally for one batch. */
export const activeRelease = (batchId?: string) =>
  paginateArray(`${REPOSITORY_PATH}/pulls?state=open&base=next`, Pull).pipe(
    Stream.filter(
      pull =>
        isReleasePull(pull) && (batchId === undefined || pull.head.ref === releaseBranch(batchId))
    ),
    Stream.runHead
  );

/** A file's UTF-8 contents at `sha`, or `None` when it does not exist there. */
const content = (path: string, sha: string) =>
  Effect.gen(function* () {
    const file = yield* requestOptional(
      `${REPOSITORY_PATH}/contents/${path}?ref=${sha}`,
      FileContent
    );
    return Option.isNone(file)
      ? Option.none<string>()
      : Option.some(yield* decodeBase64Content(file.value.content));
  });
const contentOrNull = (path: string, sha: string) =>
  Effect.map(content(path, sha), Option.getOrNull);

const contentsAt = (paths: ReadonlyArray<string>, sha: string) =>
  Effect.forEach(paths, path => contentOrNull(path, sha), { concurrency: CONTENT_CONCURRENCY });

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** A saved preparation branch must hold exactly the prepared files on top of the frozen input. */
const verifySavedBranch = (head: string, authorized: ReleaseBatch, patch: ReleasePatch) =>
  Effect.gen(function* () {
    const saved = yield* request('GET', `${REPOSITORY_PATH}/git/commits/${head}`, Commit);
    const savedDiff = yield* request(
      'GET',
      `${REPOSITORY_PATH}/compare/${authorized.inputBase}...${head}`,
      Compare
    );
    yield* ensure(
      saved.parents.length === 1 &&
        saved.parents[0].sha === authorized.inputBase &&
        sameJson(
          savedDiff.files.map(file => file.filename).sort(),
          patch.files.map(file => file.path).sort()
        ),
      'Existing preparation branch no longer matches the original source'
    );
    const contents = yield* contentsAt(
      patch.files.map(file => file.path),
      head
    );
    yield* ensure(
      patch.files.every((file, index) => contents[index] === file.after),
      'Existing preparation branch differs from the original prepared files'
    );
  });

const createPreparationBranch = (
  branch: string,
  authorized: ReleaseBatch,
  patch: ReleasePatch,
  sourceTree: string
) =>
  Effect.gen(function* () {
    const blobs = yield* Effect.forEach(
      patch.files,
      file =>
        file.after === null
          ? Effect.succeed({
              path: file.path,
              mode: '100644',
              type: 'blob',
              sha: null as string | null,
            })
          : Effect.map(
              request('POST', `${REPOSITORY_PATH}/git/blobs`, CreatedSha, {
                content: Base64.encode(file.after),
                encoding: 'base64',
              }),
              blob => ({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
            ),
      { concurrency: 'unbounded' }
    );
    const tree = yield* request('POST', `${REPOSITORY_PATH}/git/trees`, CreatedSha, {
      base_tree: sourceTree,
      tree: blobs,
    });
    const created = yield* request('POST', `${REPOSITORY_PATH}/git/commits`, CreatedSha, {
      message: 'chore(release): prepare SDK versions and documentation',
      parents: [authorized.inputBase],
      tree: tree.sha,
    });
    yield* request('POST', `${REPOSITORY_PATH}/git/refs`, CreatedRef, {
      ref: `refs/heads/${branch}`,
      sha: created.sha,
    });
  });

/** Commits the prepared patch to its release branch and opens (or recovers) the release PR. */
export const commitPreparedRelease = (value: unknown, authorizedValue: ReleaseBatch) =>
  Effect.gen(function* () {
    const authorized = yield* Schema.decodeUnknownEffect(ReleaseBatch)(authorizedValue);
    const patch = yield* Schema.decodeUnknownEffect(ReleasePatch)(value);
    yield* ensure(
      sameJson(patch.batch, authorized),
      'Prepared batch differs from the authorized request'
    );
    const alreadyCreated = yield* activeRelease(authorized.id);
    if (Option.isSome(alreadyCreated)) {
      yield* closeReplacedPull(authorized, alreadyCreated.value.html_url);
      return alreadyCreated.value.html_url;
    }
    const current = yield* activeRelease();
    if (Option.isSome(current) && current.value.number !== authorized.replaces?.number)
      return current.value.html_url;
    if (authorized.replaces) {
      const previous = yield* request(
        'GET',
        `${REPOSITORY_PATH}/pulls/${authorized.replaces.number}`,
        Pull
      );
      yield* ensure(
        !previous.merged && previous.head.sha === authorized.replaces.headSha,
        'Original release changed during refresh; inspect both candidates before continuing'
      );
    }
    const source = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/commits/${authorized.inputBase}`,
      Commit
    );
    const frozen = yield* contentsAt(
      patch.files.map(file => file.path),
      authorized.inputBase
    );
    for (const [index, file] of patch.files.entries())
      yield* ensure(
        frozen[index] === file.before,
        `Prepared input differs from frozen source: ${file.path}`
      );
    const planFile = patch.files.find(file => file.path === BATCH_PATH);
    const plannedBatch = planFile?.after
      ? yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseBatch))(planFile.after)
      : undefined;
    yield* ensure(
      plannedBatch !== undefined && sameJson(plannedBatch, authorized),
      'Prepared source plan changed'
    );
    yield* validateReleaseDiff(patch.files, authorized.plan, authorized.outputs);
    const branch = releaseBranch(authorized.id);
    const existing = yield* requestOptional(`${REPOSITORY_PATH}/git/ref/heads/${branch}`, ShaRef);
    yield* Option.match(existing, {
      onSome: ref => verifySavedBranch(ref.object.sha, authorized, patch),
      onNone: () => createPreparationBranch(branch, authorized, patch, source.tree.sha),
    });
    const pull = yield* request('POST', `${REPOSITORY_PATH}/pulls`, Pull, {
      title: 'chore(release): publish SDK packages',
      head: branch,
      base: 'next',
      body: releasePullBody(authorized, branch),
    });
    yield* closeReplacedPull(authorized, pull.html_url);
    return pull.html_url;
  });

const closeReplacedPull = (batch: ReleaseBatch, replacementUrl: string) =>
  Effect.gen(function* () {
    if (!batch.replaces) return;
    const previous = yield* request(
      'GET',
      `${REPOSITORY_PATH}/pulls/${batch.replaces.number}`,
      Pull
    );
    if (previous.state === 'closed' && !previous.merged) return;
    yield* ensure(
      !previous.merged && previous.head.sha === batch.replaces.headSha,
      `Original release changed during refresh. Replacement is preserved at ${replacementUrl}`
    );
    yield* request('PATCH', `${REPOSITORY_PATH}/pulls/${batch.replaces.number}`, Pull, {
      state: 'closed',
    });
    yield* commentIssue(
      batch.replaces.number,
      `Superseded by ${replacementUrl}. The original branch and release evidence are retained. The replacement requires a new approval.`
    );
  });

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
export const verifyOriginalBatch = (batch: ReleaseBatch) =>
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
      sameJson(saved, batch),
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

/** Checks a release PR's identity, plan, approval, final-head checks and diff; returns them. */
export const verifyReleaseHead = (number: number) =>
  Effect.gen(function* () {
    const pull = yield* request('GET', `${REPOSITORY_PATH}/pulls/${number}`, Pull);
    yield* ensure(
      pull.base.ref === 'next' && isReleasePull(pull),
      'Expected an SDK release PR into protected next'
    );
    const raw = yield* content(BATCH_PATH, pull.head.sha);
    if (Option.isNone(raw)) return yield* fail('Missing committed release plan');
    const batch = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseBatch))(raw.value);
    yield* verifyOriginalBatch(batch);
    yield* ensure(
      pull.head.ref === releaseBranch(batch.id),
      'Release branch and batch do not agree'
    );
    const reviews = yield* reviewsWithPermissions(number);
    yield* ensure(
      eligibleApproval(reviews, pull.user.login, pull.head.sha),
      'Final release head lacks an eligible non-author approval'
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
            contentOrNull(file.filename, batch.inputBase),
            contentOrNull(file.filename, pull.head.sha),
          ]),
          ([before, after]) => ({ path: file.filename, before, after }) satisfies ReleaseFile
        ),
      { concurrency: CONTENT_CONCURRENCY }
    );
    yield* validateReleaseDiff(files, batch.plan, batch.outputs);
    return { pull, batch, diff };
  });

/** Merges the verified release PR at its approved head, then authorizes its publication tag. */
export const mergeApprovedRelease = (number: number, appId: number, runId: string) =>
  Effect.gen(function* () {
    yield* ensure(
      Option.isNone(yield* activePreparation(runId)),
      'A release refresh is preparing; the previous PR must not merge'
    );
    const { pull } = yield* verifyReleaseHead(number);
    if (!pull.merged) {
      const result = yield* request(
        'PUT',
        `${REPOSITORY_PATH}/pulls/${number}/merge`,
        Schema.Struct({ merged: Schema.Boolean, sha: Sha }),
        { sha: pull.head.sha, merge_method: 'squash' }
      );
      yield* ensure(result.merged, 'Protected expected-head merge was not accepted');
    }
    return yield* authorizeSourceTag(number, appId);
  });

/**
 * Creates the immutable publication tag on the reviewed head. GitHub records that head and the
 * squash commit separately, so a single-parent squash need not list the head as a parent.
 */
export const authorizeSourceTag = (number: number, appId: number) =>
  Effect.gen(function* () {
    const { pull, batch } = yield* verifyReleaseHead(number);
    if (!pull.merged || !pull.merge_commit_sha) return yield* fail('Release PR has not merged');
    const registry = yield* Effect.promise(() => import('./registry'));
    yield* registry.verifyPublicationPolicy(
      new Set(batch.plan.releases.map(release => release.language)),
      appId
    );
    const merged = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/commits/${pull.merge_commit_sha}`,
      Commit
    );
    yield* ensure(
      merged.parents.some(parent => parent.sha === pull.head.sha) || merged.parents.length === 1,
      'Unrecognized release merge topology'
    );
    const tag = `sdk-release/${batch.id}`;
    const existing = yield* requestOptional(`${REPOSITORY_PATH}/git/ref/tags/${tag}`, TagRef);
    yield* Option.match(existing, {
      onSome: ref =>
        ensure(
          ref.object.type === 'commit' && ref.object.sha === pull.head.sha,
          'Publication source tag already points to another source'
        ),
      onNone: () =>
        request('POST', `${REPOSITORY_PATH}/git/refs`, CreatedRef, {
          ref: `refs/tags/${tag}`,
          sha: pull.head.sha,
        }),
    });
    return tag;
  });

export interface ReleaseRequestContext {
  readonly actor: string;
  readonly runId: string;
  readonly sourceSha: string;
  readonly issueNumber?: number;
  readonly runAttempt?: number;
}

export interface ReleaseRequestResult {
  readonly message: string;
  readonly batch?: ReleaseBatch;
  readonly reusedBatch?: boolean;
  readonly pullRequest?: string;
  readonly runUrl?: string;
}

/** How a request outcome is reported on its issue. */
type Reply =
  | { readonly _tag: 'Standard' }
  | { readonly _tag: 'Text'; readonly text: string }
  | { readonly _tag: 'None' };

interface Outcome {
  readonly result: ReleaseRequestResult;
  readonly reply: Reply;
}
const standard = (result: ReleaseRequestResult): Outcome => ({
  result,
  reply: { _tag: 'Standard' },
});

export type PlanRelease<E, R> = (
  choices?: SdkReleasePlan['choices'],
  corrective?: CorrectiveInput
) => Effect.Effect<SdkReleasePlan, E, R>;
export type ReleaseOutputs<E, R> = (
  ...args: Parameters<typeof releaseOutputs>
) => Effect.Effect<ReadonlyArray<string>, E, R>;

/** The batch an original run froze: its tag's batch, the batch on next, or its preparation PR's. */
const frozenBatchFor = (original: ReleaseRun) =>
  Effect.gen(function* () {
    const latest = yield* committedBatch('next');
    if (PUBLICATION_TAG.test(original.head_branch ?? ''))
      return original.head_sha === undefined
        ? Option.none<ReleaseBatch>()
        : yield* committedBatch(original.head_sha);
    return Option.exists(latest, batch => batch.originalRunId === String(original.id))
      ? latest
      : yield* batchForPreparation(String(original.id));
  });

/** The unique pull_request_target run whose source-tag job failed after the release PR merged. */
const failedSourceTagRun = (frozen: ReleaseBatch) =>
  Effect.gen(function* () {
    const pulls = yield* request(
      'GET',
      `${REPOSITORY_PATH}/pulls?state=closed&head=ComposioHQ:${releaseBranch(frozen.id)}&per_page=100`,
      Schema.Array(Pull)
    );
    const merged = pulls.find(pull => pull.merged_at || pull.merged || pull.merge_commit_sha);
    if (!merged?.merge_commit_sha) return Option.none<ReleaseRun>();
    const runs = yield* request(
      'GET',
      `${REPOSITORY_PATH}/actions/workflows/sdk.release.yml/runs?event=pull_request_target&head_sha=${merged.merge_commit_sha}&per_page=100`,
      Schema.Struct({ workflow_runs: Schema.Array(ReleaseRun) })
    );
    const failed = yield* Effect.filter(
      runs.workflow_runs,
      run =>
        Effect.map(jobs(String(run.id)), runJobs =>
          runJobs.some(job => job.name === 'source-tag' && job.conclusion === 'failure')
        ),
      { concurrency: CONTENT_CONCURRENCY }
    );
    yield* ensure(
      failed.length === 1,
      'Cannot uniquely identify the original failed source-tag authorization run'
    );
    return Option.some(failed[0]);
  });

const dispatchDocs = (runId: string | number) =>
  request(
    'POST',
    `${REPOSITORY_PATH}/actions/workflows/docs.sdk-change-sync.yml/dispatches`,
    Schema.Unknown,
    { ref: 'next', inputs: { run_id: String(runId) } }
  );

const isRetryable = (run: ReleaseRun, now: number) =>
  RETRYABLE_CONCLUSIONS.has(run.conclusion ?? '') &&
  run.run_attempt < MAX_RUN_ATTEMPTS &&
  now - Date.parse(run.created_at) < RECOVERY_WINDOW_MS;

/** Status or retry of an original run; retries follow a frozen batch to its publication run. */
const retryOrStatus = (request: ReleaseRequest & { run_id: string }) =>
  Effect.gen(function* () {
    let original = yield* getRun(request.run_id);
    yield* ensure(
      original.path === WORKFLOW_PATH &&
        original.repository.full_name === SDK_RELEASE_REPOSITORY &&
        (original.head_branch === 'next' || PUBLICATION_TAG.test(original.head_branch ?? '')),
      'Run does not belong to a guarded SDK release'
    );
    const frozen = yield* frozenBatchFor(original);
    if (Option.isSome(frozen)) {
      const publication = yield* sourceTagRun(frozen.value);
      if (Option.isSome(publication)) {
        const run = publication.value;
        const tagged =
          run.head_sha === undefined
            ? Option.none<ReleaseBatch>()
            : yield* committedBatch(run.head_sha);
        yield* ensure(
          Option.exists(tagged, batch => sameJson(batch, frozen.value)),
          'Original publication source differs from its frozen batch'
        );
        const state = yield* publicationState(run);
        if (state.verified) {
          if (request.action === 'retry') yield* dispatchDocs(run.id);
          return standard({
            message:
              request.action === 'retry'
                ? 'Packages are verified; retrying documentation on protected next without registry identity or candidate artifacts.'
                : 'Packages published; documentation status is tracked separately.',
            runUrl: run.html_url,
          });
        }
        if (state.terminal)
          return yield* fail(
            'Original publication recovery ended; a newly approved higher-version corrective release is required'
          );
        original = run;
      } else if (original.conclusion === 'success') {
        original = Option.getOrElse(yield* failedSourceTagRun(frozen.value), () => original);
      }
    }
    if (request.action === 'status' || original.status !== 'completed') {
      const conclusion = original.conclusion ? ` (${original.conclusion})` : '';
      return standard({
        message: `Original run is ${original.status}${conclusion}. Retry ignores new bump choices.`,
        runUrl: original.html_url,
      });
    }
    yield* ensure(isRetryable(original, Date.now()), 'Original release cannot be retried');
    yield* rerunFailedJobs(String(original.id));
    return standard({
      message: 'Retrying the original run. New bump choices are ignored.',
      runUrl: original.html_url,
    });
  });

/** A rerun preparation reuses its retained authorized plan instead of reallocating versions. */
const reuseAuthorizedPlan = (context: ReleaseRequestContext) =>
  Effect.gen(function* () {
    const artifact = yield* reuseCandidate(
      yield* originalCandidates(Number(context.runId)),
      AUTHORIZED_BATCH_ARTIFACT,
      Number(context.runId),
      context.sourceSha
    );
    if (Option.isSome(artifact)) {
      const saved = yield* downloadAuthorizedBatch(artifact.value);
      yield* ensure(
        saved.id === context.runId && saved.inputBase === context.sourceSha,
        'Original preparation plan identity differs'
      );
      return Option.some<Outcome>({
        result: {
          message: 'Reusing the original authorized release plan. New choices are ignored.',
          batch: saved,
          reusedBatch: true,
        },
        reply: { _tag: 'None' },
      });
    }
    const retained = (yield* jobs(context.runId)).some(
      job =>
        job.name === 'authorize' &&
        job.steps.some(
          step => step.name === 'Retain authorized release input' && step.conclusion === 'success'
        )
    );
    yield* ensure(
      !retained,
      'Original authorized release input was deleted; submit a new request instead of reallocating versions in an old run'
    );
    return Option.none<Outcome>();
  });

/** The fields of `currentPublication` a new request depends on. */
interface Publication {
  readonly batch: ReleaseBatch;
  readonly run: ReleaseRun | undefined;
  readonly active: boolean;
  readonly terminal: boolean;
}

/** A partial or terminal publication's outstanding targets become the next plan's corrective input. */
const correctiveFor = (cwd: string, publication: Publication | undefined) =>
  Effect.gen(function* () {
    const headSha = publication?.run?.head_sha;
    if (!publication || headSha === undefined) return undefined;
    const { plan } = publication.batch;
    const unselected =
      plan.corrective?.releases.filter(
        release => !plan.releases.some(selected => selected.name === release.name)
      ) ?? [];
    const outstanding = publication.terminal ? [...plan.releases, ...unselected] : unselected;
    if (!outstanding.length) return undefined;
    const registry = yield* Effect.promise(() => import('./registry'));
    return yield* registry.correctiveInventory(cwd, publication.batch, headSha, outstanding);
  });

const createStatusIssue = (run: string) =>
  Effect.map(
    request('POST', `${REPOSITORY_PATH}/issues`, Schema.Struct({ number: PositiveInt }), {
      title: `[SDK publication] Batch ${run}`,
      body: `Publication status for ${runUrl(run)}. Packages are not yet verified.`,
    }),
    issue => issue.number
  );

/** Allocates a new batch, refreshes the active one, or reports that a release is already active. */
const prepareRelease = <PE, PR, OE, OR>(
  request: ReleaseRequest,
  context: ReleaseRequestContext,
  plan: PlanRelease<PE, PR>,
  outputs: ReleaseOutputs<OE, OR>
) =>
  Effect.gen(function* () {
    const cwd = (yield* Path.Path).resolve('.');
    const [current, preparing, committed] = yield* Effect.all(
      [activeRelease(), activePreparation(context.runId), currentPublication],
      { concurrency: 'unbounded' }
    );
    const preparation: ReleaseRun | undefined = Option.getOrUndefined(preparing);
    const publication: Publication | undefined = Option.getOrUndefined(
      committed as Option.Option<Publication>
    );
    if (preparation || publication?.active) {
      const result: ReleaseRequestResult = {
        message: 'A release is already active; no competing versions were allocated.',
        runUrl: preparation?.html_url ?? publication?.run?.html_url ?? publication?.batch.statusUrl,
        ...(Option.isSome(current) ? { pullRequest: current.value.html_url } : {}),
      };
      return {
        result,
        reply: { _tag: 'Text', text: `${result.message}\n\n${result.runUrl}` },
      } satisfies Outcome;
    }
    if ((Option.isSome(current) && request.action !== 'refresh') || request.action === 'status')
      return standard(
        Option.match(current, {
          onSome: pull => ({
            message: 'A release is already active; no competing versions were allocated.',
            pullRequest: pull.html_url,
          }),
          onNone: () => ({ message: 'No active SDK release.' }),
        })
      );
    if ((context.runAttempt ?? 1) > 1) {
      const reused = yield* reuseAuthorizedPlan(context);
      if (Option.isSome(reused)) return reused.value;
    }
    let previous: ReleaseBatch | undefined;
    if (request.action === 'refresh') {
      if (Option.isNone(current)) return yield* fail('No active release candidate to refresh');
      const saved = yield* content(BATCH_PATH, current.value.head.sha);
      if (Option.isNone(saved)) return yield* fail('Active release has no frozen plan');
      previous = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseBatch))(
        saved.value
      );
      yield* verifyOriginalBatch(previous);
    }
    const corrective = yield* correctiveFor(cwd, publication);
    const selected = yield* plan(previous?.plan.choices, corrective);
    const baselineChanged = selected.releases.some(release => {
      const original = previous?.plan.releases.find(entry => entry.name === release.name);
      return original !== undefined && original.oldVersion !== release.oldVersion;
    });
    yield* ensure(
      !baselineChanged,
      'Refresh changed the original version baseline; reconcile the active release first'
    );
    if (!selected.releases.length)
      return standard({
        message: 'Nothing to release. Stable registry baselines were reconciled.',
      });
    const date = new Date().toISOString().slice(0, 10);
    const issue = context.issueNumber ?? (yield* createStatusIssue(context.runId));
    const batch = yield* Schema.decodeUnknownEffect(ReleaseBatch)({
      schemaVersion: 1,
      id: context.runId,
      originalRunId: context.runId,
      inputBase: context.sourceSha,
      date,
      statusUrl: `https://github.com/${SDK_RELEASE_REPOSITORY}/issues/${issue}`,
      plan: selected,
      ...(previous && Option.isSome(current)
        ? { replaces: { number: current.value.number, headSha: current.value.head.sha } }
        : {}),
      outputs: yield* outputs(
        cwd,
        date,
        context.runId,
        new Set(selected.releases.map(release => release.language)),
        new Set(selected.releases.map(release => release.name))
      ),
    });
    return standard({
      message:
        'Release preparation authorized. The concrete release PR requires final-head approval and green checks.',
      batch,
    });
  });

const replyText = (outcome: Outcome, runId: string) => {
  switch (outcome.reply._tag) {
    case 'None':
      return undefined;
    case 'Text':
      return outcome.reply.text;
    case 'Standard':
      return `${outcome.result.message}\n\n${outcome.result.pullRequest ?? outcome.result.runUrl ?? runUrl(runId)}`;
  }
};

const causeMessage = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : 'Release request failed';
};

/** Authorizes the requester, then serves a release, refresh, status or retry request. */
export const executeReleaseRequest = <PE, PR, OE = never, OR = never>(
  value: ReleaseRequest,
  context: ReleaseRequestContext,
  plan: PlanRelease<PE, PR>,
  outputs: ReleaseOutputs<OE, OR> = releaseOutputs as unknown as ReleaseOutputs<OE, OR>
) =>
  Effect.gen(function* () {
    const request = yield* Schema.decodeUnknownEffect(ReleaseRequest)(value);
    yield* requireActiveMember(context.actor);
    const reply = (text: string) =>
      context.issueNumber === undefined ? Effect.void : commentIssue(context.issueNumber, text);
    const outcome = yield* Effect.gen(function* () {
      const served: Outcome =
        request.run_id !== undefined && (request.action === 'retry' || request.action === 'status')
          ? yield* retryOrStatus({ ...request, run_id: request.run_id })
          : yield* prepareRelease(request, context, plan, outputs);
      const text = replyText(served, context.runId);
      if (text !== undefined) yield* reply(text);
      return served;
    }).pipe(
      Effect.tapCause(cause =>
        reply(
          `The release request could not complete: ${causeMessage(cause)}\n\nInspect this request run: ${runUrl(context.runId)}`
        ).pipe(
          Effect.catchCause(reportCause =>
            Console.error(
              'Could not report the release request failure:',
              causeMessage(reportCause)
            )
          )
        )
      )
    );
    return outcome.result;
  });

const Mode = Schema.Literals(['authorize', 'commit', 'tag', 'merge', 'report']);
type Mode = typeof Mode.Type;

const Environment = Config.all({
  token: Config.schema(Schema.NonEmptyString, 'SDK_RELEASE_TOKEN'),
  runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  eventPath: Config.String('GITHUB_EVENT_PATH'),
  eventName: Config.String('GITHUB_EVENT_NAME'),
  outputPath: Config.String('GITHUB_OUTPUT'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
  appId: Config.schema(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThan(0)),
    'SDK_RELEASE_APP_ID'
  ),
});
type Environment = Config.Success<typeof Environment>;

const EventEnvelope = Schema.Struct({
  sender: Schema.Struct({ login: Schema.String }),
  issue: Schema.optionalKey(Schema.Struct({ number: PositiveInt })),
  pull_request: Schema.optionalKey(Schema.Struct({ number: PositiveInt })),
});
const WorkflowRunEvent = Schema.Struct({ workflow_run: Schema.Struct({ id: PositiveInt }) });

const appendFile = (path: string, text: string) =>
  Effect.gen(function* () {
    yield* (yield* FileSystem.FileSystem).writeFileString(path, text, { flag: 'a' });
  });
const writeSummary = (env: Environment, text: string) =>
  Effect.gen(function* () {
    yield* (yield* FileSystem.FileSystem).writeFileString(env.summaryPath, text);
  });

interface ModeInput {
  readonly env: Environment;
  readonly event: unknown;
  readonly envelope: typeof EventEnvelope.Type;
}

const reportMode = ({ env, event }: ModeInput) =>
  Effect.gen(function* () {
    const runId = (yield* Schema.decodeUnknownEffect(WorkflowRunEvent)(event)).workflow_run.id;
    const publication = yield* Effect.promise(() => import('./publication'));
    const { report } = yield* publication.reportPublication(String(runId), env.appId);
    if (report.registryVerified) yield* dispatchDocs(runId);
    yield* appendFile(
      env.outputPath,
      `registry-verified=${report.registryVerified}\noriginal-run-id=${report.runId}\n`
    );
    yield* writeSummary(
      env,
      `Publication status updated for original run ${runId}. Registry verified: ${report.registryVerified}; docs: ${report.docs}.\n`
    );
  });

/** Merging waits quietly for approval and checks; only GitHub API failures fail the step. */
const mergeMode = ({ env }: ModeInput) =>
  Effect.gen(function* () {
    const current = yield* activeRelease();
    if (Option.isNone(current)) return;
    yield* mergeApprovedRelease(current.value.number, env.appId, env.runId).pipe(
      Effect.flatMap(tag => writeSummary(env, `Approved publication source: ${tag}\n`)),
      Effect.catch((error): Effect.Effect<void, unknown, FileSystem.FileSystem> =>
        Predicate.isTagged(error, 'GitHubApiError')
          ? Effect.fail(error)
          : writeSummary(
              env,
              `Release awaits current-head approval or successful candidate checks: ${current.value.html_url}\n${error instanceof Error ? error.message : 'not eligible'}\n`
            )
      )
    );
  });

const tagMode = ({ env, envelope }: ModeInput) =>
  Effect.gen(function* () {
    if (!envelope.pull_request) return yield* fail('Expected merged release PR event');
    const tag = yield* authorizeSourceTag(envelope.pull_request.number, env.appId);
    yield* writeSummary(env, `Approved publication source: ${tag}\n`);
  });

const commitMode = ({ env }: ModeInput) =>
  Effect.gen(function* () {
    const batch = yield* readJson(ReleaseBatch, '/tmp/sdk-authorized/batch.json');
    const patch = yield* readJson(Schema.Unknown, '/tmp/sdk-prepared/patch.json');
    const url = yield* commitPreparedRelease(patch, batch);
    yield* writeSummary(env, `Release PR: ${url}\n`);
  });

const authorizeMode = ({ env, event, envelope }: ModeInput) =>
  Effect.gen(function* () {
    const cwd = (yield* Path.Path).resolve('.');
    const runAttempt = yield* Config.schema(
      Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThan(0)),
      'GITHUB_RUN_ATTEMPT'
    );
    const request = yield* Effect.try(() => parseReleaseRequest(env.eventName, event));
    const result = yield* executeReleaseRequest(
      request,
      {
        actor: envelope.sender.login,
        runId: env.runId,
        sourceSha: env.sha,
        runAttempt,
        ...(envelope.issue ? { issueNumber: envelope.issue.number } : {}),
      },
      (choices, corrective) =>
        Effect.gen(function* () {
          const baseline = yield* fetchStableRegistryBaseline(cwd);
          return yield* createSdkReleasePlan(cwd, {
            ...request,
            ...choices,
            ...(corrective ? { corrective } : {}),
            baseline,
          });
        })
    );
    if (result.batch) {
      yield* (yield* FileSystem.FileSystem).writeFileString(
        'sdk-release-batch.json',
        formatJson(result.batch)
      );
      const prepared = result.reusedBatch
        ? yield* reuseCandidate(
            yield* originalCandidates(Number(env.runId)),
            'sdk-prepared-patch',
            Number(env.runId),
            env.sha
          )
        : Option.none();
      yield* appendFile(
        env.outputPath,
        `prepare=true\nnew-batch=${!result.reusedBatch}\nreuse-patch=${Option.isSome(prepared)}\n`
      );
    }
    yield* writeSummary(env, `${result.message}\n${result.pullRequest ?? result.runUrl ?? ''}\n`);
  });

const MODES: Record<
  Mode,
  (input: ModeInput) => Effect.Effect<void, unknown, GitHub | ReleaseServices>
> = {
  authorize: authorizeMode,
  commit: commitMode,
  tag: tagMode,
  merge: mergeMode,
  report: reportMode,
};

const main = Effect.gen(function* () {
  const [argument] = yield* (yield* Stdio.Stdio).args;
  const mode = yield* Schema.decodeUnknownEffect(Mode)(argument);
  const env = yield* Environment;
  const event = yield* readJson(Schema.Unknown, env.eventPath);
  const envelope = yield* Schema.decodeUnknownEffect(EventEnvelope)(event);
  yield* MODES[mode]({ env, event, envelope }).pipe(Effect.provide(GitHub.layer(env.token)));
});

if (import.meta.main) runMain(main);
