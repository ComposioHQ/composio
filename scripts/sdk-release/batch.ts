import {
  Cause,
  Config,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  Stdio,
  Stream,
} from 'effect';
import { Base64 } from 'effect/encoding';
import {
  AUTHORIZED_BATCH_ARTIFACT,
  Compare,
  Pull,
  WORKFLOW_PATH,
  downloadAuthorizedBatch,
  isReleasePull,
  readReleasePull,
  releaseBranch,
  verifyOriginalBatch,
  verifyReleaseGate,
} from './approval';
import { originalCandidates, reuseCandidate } from './artifacts';
import {
  currentPublication,
  activePreparation,
  batchForPreparation,
  committedBatch,
  publicationState,
  sourceTagRun,
} from './coordination';
import {
  CONTENT_CONCURRENCY,
  GitHub,
  REPOSITORY_PATH,
  ReleaseRun,
  RunId,
  SDK_RELEASE_REPOSITORY,
  Sha,
  commentIssue,
  fileAt,
  fileAtOrNull,
  getRun,
  jobs,
  paginateArray,
  request,
  requestOptional,
  requireActiveMember,
  rerunFailedJobs,
} from './github';
import { createSdkReleasePlan, type CorrectiveInput, type SdkReleasePlan } from './plan';
import { correctiveInventory, verifyPublicationPolicy } from './registry';
import { fetchStableRegistryBaseline } from './registry-baseline';
import { releasePullBody } from './release-pr';
import { ReleaseRequest, parseReleaseRequest } from './request';
import { ensure, fail, formatJson, readJson, runMain, type ReleaseServices } from './runtime';
import {
  BATCH_PATH,
  ReleaseBatch,
  ReleasePatch,
  releaseOutputs,
  validateReleaseDiff,
} from './source';

const PUBLICATION_TAG = /^sdk-release\/\d+$/;
const RETRYABLE_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out']);
const MAX_RUN_ATTEMPTS = 50;
const RECOVERY_WINDOW_MS = 30 * 86_400_000;
const runUrl = (id: string | number) =>
  `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}`;
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const Commit = Schema.Struct({
  sha: Sha,
  tree: Schema.Struct({ sha: Sha }),
  parents: Schema.Array(Schema.Struct({ sha: Sha })),
});
const CreatedSha = Schema.Struct({ sha: Sha });
const ShaRef = Schema.Struct({ object: Schema.Struct({ sha: Sha }) });
const TagRef = Schema.Struct({ object: Schema.Struct({ type: Schema.String, sha: Sha }) });
const CreatedRef = Schema.Struct({ ref: Schema.String });

/** The open release PR into next, optionally for one batch. */
export const activeRelease = (batchId?: string) =>
  paginateArray(`${REPOSITORY_PATH}/pulls?state=open&base=next`, Pull).pipe(
    Stream.filter(
      pull =>
        isReleasePull(pull) && (batchId === undefined || pull.head.ref === releaseBranch(batchId))
    ),
    Stream.runHead
  );

const contentsAt = (paths: ReadonlyArray<string>, sha: string) =>
  Effect.forEach(paths, path => fileAtOrNull(path, sha), { concurrency: CONTENT_CONCURRENCY });

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

const causeMessage = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : 'Release request failed';
};

/** Explains a merged release that failed its gate on the PR and its request issue. */
const reportRefusedRelease = (pull: Pull, batch: ReleaseBatch, cause: Cause.Cause<unknown>) => {
  const body = [
    `Release PR #${pull.number} merged, but it failed the release gate, so no publication tag was created and nothing was published.`,
    `Reason: ${causeMessage(cause)}`,
    'Revert this release PR on next, then request the release again.',
  ].join('\n\n');
  const issue = /\/issues\/(\d+)$/.exec(batch.statusUrl)?.[1];
  return Effect.gen(function* () {
    yield* commentIssue(pull.number, body);
    if (issue !== undefined) yield* commentIssue(Number(issue), body);
  }).pipe(
    Effect.catchCause(reportCause =>
      Console.error('Could not report the refused release:', causeMessage(reportCause))
    )
  );
};

/**
 * Creates the immutable publication tag on the reviewed head. GitHub records that head and the
 * squash commit separately, so a single-parent squash need not list the head as a parent.
 */
export const authorizeSourceTag = (number: number, appId: number) =>
  Effect.gen(function* () {
    const { pull, batch } = yield* readReleasePull(number);
    if (!pull.merged || !pull.merge_commit_sha) return yield* fail('Release PR has not merged');
    yield* verifyReleaseGate(pull, batch).pipe(
      Effect.tapCause(cause => reportRefusedRelease(pull, batch, cause))
    );
    yield* verifyPublicationPolicy(
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
    return yield* correctiveInventory(cwd, publication.batch, headSha, outstanding);
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
      const saved = yield* fileAt(BATCH_PATH, current.value.head.sha);
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
      requestedBy: [...new Set([...(previous?.requestedBy ?? []), context.actor])],
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

const Mode = Schema.Literals(['authorize', 'commit', 'tag', 'report']);
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
      // The prepare job reads the batch from this output; release-pr re-checks it against the artifact.
      const compact = JSON.stringify(result.batch);
      yield* ensure(compact.length < 900_000, 'Release batch exceeds the job output limit');
      yield* appendFile(env.outputPath, `batch=${compact}\n`);
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
