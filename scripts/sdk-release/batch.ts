import { Cause, Config, Console, Effect, Option, Path, Schema, Stdio, Stream } from 'effect';
import { Base64 } from 'effect/encoding';
import {
  CONTENT_CONCURRENCY,
  CreatedSha,
  GitHub,
  PositiveInt,
  REPOSITORY_PATH,
  RunId,
  Sha,
  commentIssue,
  fileAtOrNull,
  paginateArray,
  request,
  requestOptional,
  requireActiveMember,
  runUrl,
} from './github';
import { createSdkReleasePlan, type SdkReleasePlan } from './plan';
import { Pull, isReleasePull, releaseBranch, releasePullBody } from './release-pr';
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
  validateReleaseDiff,
} from './source';

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

const causeMessage = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : 'Release request failed';
};

// 1. request -----------------------------------------------------------------------------------

export interface ReleaseRequestContext {
  readonly actor: string;
  readonly runId: string;
  readonly sourceSha: string;
  readonly issueNumber?: number;
}

export interface ReleaseRequestResult {
  readonly message: string;
  readonly batch?: ReleaseBatch;
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
 * Checks that the requester is an active ComposioHQ member, plans versions, and replies on the
 * request issue. Returns the batch to prepare, or only a message when there is nothing to do.
 */
export const executeReleaseRequest = <E, R>(
  value: ReleaseRequest,
  context: ReleaseRequestContext,
  plan: (request: ReleaseRequest) => Effect.Effect<SdkReleasePlan, E, R>
) =>
  Effect.gen(function* () {
    const releaseRequest = yield* Schema.decodeUnknownEffect(ReleaseRequest)(value);
    yield* requireActiveMember(context.actor);
    const reply = (text: string) =>
      context.issueNumber === undefined ? Effect.void : commentIssue(context.issueNumber, text);
    return yield* Effect.gen(function* () {
      const current = yield* activeRelease;
      if (Option.isSome(current)) {
        const result: ReleaseRequestResult = {
          message: `Another SDK release is in progress: ${current.value.html_url}. Request this release again after it finishes.`,
        };
        yield* reply(result.message);
        return result;
      }
      const selected = yield* plan(releaseRequest);
      if (!selected.releases.length) {
        const result: ReleaseRequestResult = { message: 'Nothing to release.' };
        yield* reply(result.message);
        return result;
      }
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
      const result: ReleaseRequestResult = {
        message: `Planned. The release PR opens from ${runUrl(context.runId)}.`,
        batch,
      };
      yield* reply(result.message);
      return result;
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
    if (Option.isSome(current)) {
      // A re-run after the PR opened repeats the issue link in case that comment failed.
      if (current.value.head.ref === releaseBranch(batch.id)) {
        yield* commentIssue(batch.issue, `Release PR: ${current.value.html_url}`);
        return current.value.html_url;
      }
      // Not a failure of this run: the requester is told what to do, and nothing was created.
      yield* commentIssue(
        batch.issue,
        `Another SDK release is in progress: ${current.value.html_url}. Request this release again after it finishes.`
      );
      return undefined;
    }
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
    yield* validateReleaseDiff(patch.files, batch.plan, outputs);
    const branch = yield* commitReleaseBranch(batch, patch);
    const pull = yield* request('POST', `${REPOSITORY_PATH}/pulls`, Pull, {
      title: 'chore(release): publish SDK packages',
      head: branch,
      base: 'next',
      body: releasePullBody(batch, branch, outputs),
    });
    yield* commentIssue(batch.issue, `Release PR: ${pull.html_url}`);
    return pull.html_url;
  });

// entry point ----------------------------------------------------------------------------------

const Environment = Config.all({
  token: Config.schema(Schema.NonEmptyString, 'SDK_RELEASE_TOKEN'),
  runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  eventPath: Config.String('GITHUB_EVENT_PATH'),
  eventName: Config.String('GITHUB_EVENT_NAME'),
  outputPath: Config.String('GITHUB_OUTPUT'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
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

const MODES: Record<'plan' | 'release-pr', Mode> = {
  plan: (env: Environment, event: unknown, envelope: typeof EventEnvelope.Type) =>
    Effect.gen(function* () {
      const cwd = (yield* Path.Path).resolve('.');
      const releaseRequest = yield* Effect.try(() => parseReleaseRequest(env.eventName, event));
      const result = yield* executeReleaseRequest(
        releaseRequest,
        {
          actor: envelope.sender.login,
          runId: env.runId,
          sourceSha: env.sha,
          ...(envelope.issue ? { issueNumber: envelope.issue.number } : {}),
        },
        choices => createSdkReleasePlan(cwd, choices)
      );
      if (result.batch) {
        yield* appendFile(env.outputPath, `batch=${JSON.stringify(result.batch)}\n`);
      }
      yield* appendFile(env.summaryPath, `${result.message}\n`);
    }),
  'release-pr': (env: Environment) =>
    Effect.gen(function* () {
      const [, patchPath] = yield* (yield* Stdio.Stdio).args;
      if (!patchPath) return yield* fail('Expected the prepared patch path');
      const url = yield* openReleasePull(
        (yield* Path.Path).resolve('.'),
        yield* plannedBatch,
        yield* readJson(Schema.Unknown, patchPath)
      );
      yield* appendFile(
        env.summaryPath,
        url ? `Release PR: ${url}\n` : 'Another SDK release is in progress.\n'
      );
    }),
};

/** `batch.ts plan` or `batch.ts release-pr <patch>`. */
const main = Effect.gen(function* () {
  const [argument] = yield* (yield* Stdio.Stdio).args;
  const mode = yield* Schema.decodeUnknownEffect(Schema.Literals(['plan', 'release-pr']))(
    argument
  );
  const env = yield* Environment;
  const event = yield* readJson(Schema.Unknown, env.eventPath);
  const envelope = yield* Schema.decodeUnknownEffect(EventEnvelope)(event);
  yield* MODES[mode](env, event, envelope).pipe(Effect.provide(GitHub.layer(env.token)));
});

if (import.meta.main) runMain(main);
