import { Config, Effect, Option, Path, Schema, Stdio, Stream } from 'effect';
import { Base64 } from 'effect/encoding';
import { readReleasePull, trustedIssue, verifyReleaseGate } from './approval';
import {
  CONTENT_CONCURRENCY,
  CreatedSha,
  GitHub,
  PositiveInt,
  REPOSITORY_PATH,
  RunId,
  Sha,
  TagRef,
  commentIssue,
  fileAt,
  fileAtOrNull,
  paginateArray,
  request,
  requestOptional,
  requireActiveMember,
  runUrl,
} from './github';
import { createSdkReleasePlan, type SdkReleasePlan } from './plan';
import {
  Pull,
  isReleasePull,
  releaseBranch,
  releasePullBody,
  releasePullTitle,
} from './release-pr';
import { ReleaseRequest, parseReleaseRequest } from './request';
import {
  appendFile,
  ensure,
  fail,
  readJson,
  runMain,
  sameJson,
  type ReleaseServices,
} from './runtime';
import {
  BATCH_PATH,
  ReleaseBatch,
  ReleasePatch,
  releaseOutputs,
  releaseTag,
  validateBatchDiff,
} from './source';
import { ReleaseState } from './state';

const Commit = Schema.Struct({
  sha: Sha,
  tree: Schema.Struct({ sha: Sha }),
  parents: Schema.Array(Schema.Struct({ sha: Sha })),
});
const CreatedRef = Schema.Struct({ ref: Schema.String });

/** The open release PR into next, if any. Only one release runs at a time. */
export const activeRelease = paginateArray(
  `${REPOSITORY_PATH}/pulls?state=open&base=next`,
  Pull
).pipe(Stream.filter(isReleasePull), Stream.runHead);

/**
 * The id of a release plan committed on `sha` whose tag was never created: its release PR merged
 * but failed the gate, or its tag job has not finished. Only the id is read, so older plan shapes
 * still decode.
 */
const untaggedRelease = (sha: string) =>
  Effect.gen(function* () {
    const committed = yield* fileAt(BATCH_PATH, sha);
    if (Option.isNone(committed)) return Option.none<string>();
    const { id } = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Struct({ id: RunId }))
    )(committed.value);
    const tag = yield* requestOptional(`${REPOSITORY_PATH}/git/ref/tags/${releaseTag(id)}`, TagRef);
    return Option.isNone(tag) ? Option.some(id) : Option.none<string>();
  });

// 1. request -----------------------------------------------------------------------------------

export interface ReleaseRequestContext {
  readonly actor: string;
  readonly runId: string;
  readonly sourceSha: string;
  readonly issueNumber?: number;
  /** The release App, whose commits alone may name a request issue. */
  readonly appSlug: string;
}

/** A request either ends the request stage or plans a batch for the release PR jobs. */
export type RequestOutcome =
  { readonly _tag: 'Planned'; readonly batch: ReleaseBatch } | ReleaseState;

/** The outcome, and the request issue the status job shows it on, when there is one. */
export interface RequestResult {
  readonly outcome: RequestOutcome;
  readonly issue: Option.Option<number>;
}

/** Opens the tracking issue for a dispatch-started release; issue-form requests already have one. */
const createRequestIssue = (run: string) =>
  Effect.map(
    request('POST', `${REPOSITORY_PATH}/issues`, Schema.Struct({ number: PositiveInt }), {
      title: `SDK release ${run}`,
      body: `Requested from ${runUrl(run)}. The release PR, publication result and any failure are reported here.`,
    }),
    issue => issue.number
  );

/**
 * Checks that the requester is an active ComposioHQ member, then decides the request: resume
 * its own open release PR, wait for another one, refuse while an untagged release sits on
 * `next`, or plan versions. The request issue shows the outcome; nothing is posted here.
 */
export const executeReleaseRequest = <E, R>(
  parse: Effect.Effect<ReleaseRequest, string>,
  context: ReleaseRequestContext,
  plan: (request: ReleaseRequest) => Effect.Effect<SdkReleasePlan, E, R>
) =>
  Effect.gen(function* () {
    yield* requireActiveMember(context.actor);
    return yield* parse.pipe(
      Effect.matchEffect({
        onFailure: reason =>
          Effect.succeed<RequestResult>({
            outcome: ReleaseState.make({ _tag: 'NeedsInput', reason }),
            issue: Option.fromNullishOr(context.issueNumber),
          }),
        onSuccess: releaseRequest => decideRequest(releaseRequest, context, plan),
      })
    );
  });

const decideRequest = <E, R>(
  releaseRequest: ReleaseRequest,
  context: ReleaseRequestContext,
  plan: (request: ReleaseRequest) => Effect.Effect<SdkReleasePlan, E, R>
) =>
  Effect.gen(function* () {
    const requestIssue = Option.fromNullishOr(context.issueNumber);
    const decided = (outcome: ReleaseState, issue = requestIssue): RequestResult => ({
      outcome,
      issue,
    });
    const current = yield* activeRelease;
    if (Option.isSome(current) && current.value.head.ref === releaseBranch(context.runId)) {
      // A re-run of a dispatch has no issue in its event; its release PR's plan names it.
      const issue = Option.isSome(requestIssue)
        ? requestIssue
        : yield* Effect.flatMap(readReleasePull(current.value.number), ({ pull, batch }) =>
            trustedIssue(pull, batch, context.appSlug)
          );
      return decided(ReleaseState.make({ _tag: 'InReview', pull: current.value.html_url }), issue);
    }
    if (Option.isSome(current))
      return decided(ReleaseState.make({ _tag: 'Waiting', pull: current.value.html_url }));
    const untagged = yield* untaggedRelease(context.sourceSha);
    if (Option.isSome(untagged))
      return decided(ReleaseState.make({ _tag: 'Blocked', release: untagged.value }));
    const selected = yield* plan(releaseRequest);
    if (!selected.releases.length) return decided(ReleaseState.make({ _tag: 'Empty' }));
    const issue = context.issueNumber ?? (yield* createRequestIssue(context.runId));
    const batch = yield* Schema.decodeUnknownEffect(ReleaseBatch)({
      id: context.runId,
      inputBase: context.sourceSha,
      requestedBy: context.actor,
      issue,
      date: new Date().toISOString().slice(0, 10),
      plan: selected,
    });
    // The batch travels as one environment variable, which Linux caps at 128 KiB.
    yield* ensure(
      new TextEncoder().encode(JSON.stringify(batch)).length < 120_000,
      'Release batch is too large to pass between jobs'
    );
    return { outcome: { _tag: 'Planned', batch }, issue: Option.some(issue) } as RequestResult;
  });

// 2. release PR --------------------------------------------------------------------------------

/** Commits the prepared files on top of the frozen source and points the release branch at it. */
const commitReleaseBranch = (batch: ReleaseBatch, patch: ReleasePatch) =>
  Effect.gen(function* () {
    const source = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/commits/${batch.inputBase}`,
      Commit
    );
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
      { concurrency: CONTENT_CONCURRENCY }
    );
    const tree = yield* request('POST', `${REPOSITORY_PATH}/git/trees`, CreatedSha, {
      base_tree: source.tree.sha,
      tree: blobs,
    });
    const commit = yield* request('POST', `${REPOSITORY_PATH}/git/commits`, CreatedSha, {
      message: 'chore(release): prepare SDK versions and documentation',
      parents: [batch.inputBase],
      tree: tree.sha,
    });
    const branch = releaseBranch(batch.id);
    // A re-run of this job replaces its own branch; the batch ID is unique to the request run.
    const existing = yield* requestOptional(
      `${REPOSITORY_PATH}/git/ref/heads/${branch}`,
      CreatedRef
    );
    if (Option.isSome(existing))
      yield* request('PATCH', `${REPOSITORY_PATH}/git/refs/heads/${branch}`, CreatedRef, {
        sha: commit.sha,
        force: true,
      });
    else
      yield* request('POST', `${REPOSITORY_PATH}/git/refs`, CreatedRef, {
        ref: `refs/heads/${branch}`,
        sha: commit.sha,
      });
    return branch;
  });

/** Checks the prepared patch is release-only for `batch`, commits it and opens the release PR. */
export const openReleasePull = (cwd: string, planned: ReleaseBatch, value: unknown) =>
  Effect.gen(function* () {
    // Decoding both sides puts their keys in schema order, so the JSON comparison below is exact.
    const batch = yield* Schema.decodeUnknownEffect(ReleaseBatch)(planned);
    const patch = yield* Schema.decodeUnknownEffect(ReleasePatch)(value);
    const current = yield* activeRelease;
    // A re-run after the PR opened finds its own PR; any other open release PR wins.
    if (Option.isSome(current))
      return ReleaseState.make({
        _tag: current.value.head.ref === releaseBranch(batch.id) ? 'InReview' : 'Waiting',
        pull: current.value.html_url,
      });
    // Another release may have merged and failed its gate since this one was planned.
    const next = yield* request('GET', `${REPOSITORY_PATH}/git/ref/heads/next`, TagRef);
    const untagged = yield* untaggedRelease(next.object.sha);
    if (Option.isSome(untagged))
      return ReleaseState.make({ _tag: 'Blocked', release: untagged.value });
    const frozen = yield* Effect.forEach(
      patch.files,
      file => fileAtOrNull(file.path, batch.inputBase),
      { concurrency: CONTENT_CONCURRENCY }
    );
    for (const [index, file] of patch.files.entries())
      yield* ensure(
        frozen[index] === file.before,
        `Prepared input differs from frozen source: ${file.path}`
      );
    const planFile = patch.files.find(file => file.path === BATCH_PATH)?.after;
    yield* ensure(
      planFile !== undefined &&
        planFile !== null &&
        sameJson(
          yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseBatch))(planFile),
          batch
        ),
      'Prepared release plan differs from the planned batch'
    );
    const outputs = yield* releaseOutputs(cwd, batch);
    yield* validateBatchDiff(patch.files, batch, outputs);
    const branch = yield* commitReleaseBranch(batch, patch);
    const pull = yield* request('POST', `${REPOSITORY_PATH}/pulls`, Pull, {
      title: releasePullTitle(batch),
      head: branch,
      base: 'next',
      body: releasePullBody(batch, branch, outputs),
    });
    return ReleaseState.make({ _tag: 'InReview', pull: pull.html_url });
  });

// 3. tag ---------------------------------------------------------------------------------------

/**
 * Decides a closed release PR. An unmerged PR is abandoned. A merged one is tagged on its reviewed
 * head only if it passes the release gate; a gate verdict refuses it and says so on the PR, while
 * a GitHub or transport error fails the job so "Re-run failed jobs" retries it. GitHub records the
 * head and the squash commit separately, so a single-parent squash need not list the head.
 */
export const authorizeSourceTag = (pull: Pull, batch: ReleaseBatch, appSlug: string) =>
  Effect.gen(function* () {
    if (!pull.merged || !pull.merge_commit_sha)
      return ReleaseState.make({ _tag: 'Abandoned', pull: pull.html_url });
    const verdict = yield* verifyReleaseGate(pull, batch, appSlug).pipe(
      Effect.as(Option.none<string>()),
      Effect.catchTag('ReleaseError', error => Effect.succeedSome(error.message))
    );
    if (Option.isSome(verdict)) {
      yield* commentIssue(
        pull.number,
        `This release PR merged, but it failed the release gate, so nothing was tagged or published.\n\nReason: ${verdict.value}\n\nRevert it on \`next\`, then request the release again.`
      );
      return ReleaseState.make({ _tag: 'Refused', pull: pull.html_url, reason: verdict.value });
    }
    const merged = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/commits/${pull.merge_commit_sha}`,
      Commit
    );
    yield* ensure(
      merged.parents.some(parent => parent.sha === pull.head.sha) || merged.parents.length === 1,
      'Unrecognized release merge topology'
    );
    const tag = releaseTag(batch.id);
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
    return ReleaseState.make({ _tag: 'Tagged', tag });
  });

// entry point ----------------------------------------------------------------------------------

const Environment = Config.all({
  token: Config.schema(Schema.NonEmptyString, 'SDK_RELEASE_TOKEN'),
  runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  eventPath: Config.String('GITHUB_EVENT_PATH'),
  eventName: Config.String('GITHUB_EVENT_NAME'),
  outputPath: Config.String('GITHUB_OUTPUT'),
});
type Environment = Config.Success<typeof Environment>;

const EventEnvelope = Schema.Struct({
  sender: Schema.Struct({ login: Schema.String }),
  issue: Schema.optionalKey(Schema.Struct({ number: PositiveInt })),
  pull_request: Schema.optionalKey(Schema.Struct({ number: PositiveInt })),
});

const plannedBatch = Config.schema(Schema.fromJsonString(ReleaseBatch), 'SDK_RELEASE_BATCH');

type Mode = (
  env: Environment,
  event: unknown,
  envelope: typeof EventEnvelope.Type
) => Effect.Effect<void, unknown, GitHub | ReleaseServices>;

/** Writes the request issue, when known, for the stage's status job. */
const outputIssue = (env: Environment, issue: Option.Option<number>) =>
  Option.match(issue, {
    onNone: () => Effect.void,
    onSome: number => appendFile(env.outputPath, `issue=${number}\n`),
  });

/** Writes a stage outcome as a job output for the stage's status job. */
const outputState = (env: Environment, state: ReleaseState) =>
  appendFile(env.outputPath, `state=${JSON.stringify(state)}\n`);

const MODES: Record<'plan' | 'release-pr' | 'tag', Mode> = {
  plan: (env: Environment, event: unknown, envelope: typeof EventEnvelope.Type) =>
    Effect.gen(function* () {
      const cwd = (yield* Path.Path).resolve('.');
      // Known before planning, so a failure is still reported on the request issue.
      if (envelope.issue) yield* appendFile(env.outputPath, `issue=${envelope.issue.number}\n`);
      const appSlug = yield* Config.String('SDK_RELEASE_APP_SLUG');
      const { outcome, issue } = yield* executeReleaseRequest(
        Effect.try({
          try: () => parseReleaseRequest(env.eventName, event),
          catch: error => (error instanceof Error ? error.message : 'Unreadable request'),
        }),
        {
          actor: envelope.sender.login,
          runId: env.runId,
          sourceSha: env.sha,
          appSlug,
          ...(envelope.issue ? { issueNumber: envelope.issue.number } : {}),
        },
        choices => createSdkReleasePlan(cwd, { ...choices, run: env.runId })
      );
      yield* outcome._tag === 'Planned'
        ? appendFile(env.outputPath, `batch=${JSON.stringify(outcome.batch)}\n`)
        : outputState(env, outcome);
      yield* outputIssue(env, issue);
    }),
  'release-pr': (env: Environment) =>
    Effect.gen(function* () {
      const [, patchPath] = yield* (yield* Stdio.Stdio).args;
      if (!patchPath) return yield* fail('Expected the prepared patch path');
      const state = yield* openReleasePull(
        (yield* Path.Path).resolve('.'),
        yield* plannedBatch,
        yield* readJson(Schema.Unknown, patchPath)
      );
      yield* outputState(env, state);
    }),
  tag: (env: Environment, _event: unknown, envelope: typeof EventEnvelope.Type) =>
    Effect.gen(function* () {
      if (!envelope.pull_request) return yield* fail('Expected a closed release PR event');
      const appSlug = yield* Config.String('SDK_RELEASE_APP_SLUG');
      const { pull, batch } = yield* readReleasePull(envelope.pull_request.number);
      const issue = yield* trustedIssue(pull, batch, appSlug);
      yield* outputIssue(env, issue);
      yield* outputState(env, yield* authorizeSourceTag(pull, batch, appSlug));
    }),
};

/** `batch.ts plan`, `batch.ts release-pr <patch>`, or `batch.ts tag`. */
const main = Effect.gen(function* () {
  const [argument] = yield* (yield* Stdio.Stdio).args;
  const mode = yield* Schema.decodeUnknownEffect(Schema.Literals(['plan', 'release-pr', 'tag']))(
    argument
  );
  const env = yield* Environment;
  const event = yield* readJson(Schema.Unknown, env.eventPath);
  const envelope = yield* Schema.decodeUnknownEffect(EventEnvelope)(event);
  yield* MODES[mode](env, event, envelope).pipe(Effect.provide(GitHub.layer(env.token)));
});

if (import.meta.main) runMain(main);
