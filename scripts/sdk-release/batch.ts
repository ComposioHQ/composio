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
  Compare,
  Pull,
  isReleasePull,
  readReleasePull,
  releaseBranch,
  verifyReleaseGate,
} from './approval';
import {
  CONTENT_CONCURRENCY,
  CreatedSha,
  GitHub,
  PositiveInt,
  PositiveIntFromString,
  REPOSITORY_PATH,
  RunId,
  SDK_RELEASE_REPOSITORY,
  Sha,
  ShaRef,
  TagRef,
  commentIssue,
  fileAtOrNull,
  paginateArray,
  request,
  requestOptional,
  requireActiveMember,
  runUrl,
} from './github';
import { createSdkReleasePlan, type SdkReleasePlan, type SupersedeInput } from './plan';
import { discoverPythonPackages } from './python-metadata';
import { verifyPublicationPolicy } from './registry';
import { fetchStableRegistryBaseline } from './registry-baseline';
import { releasePullBody } from './release-pr';
import { ReleaseRequest, parseReleaseRequest } from './request';
import {
  appendFile,
  ensure,
  fail,
  formatJson,
  readJson,
  runMain,
  sameJson,
  type ReleaseServices,
} from './runtime';
import {
  BATCH_PATH,
  ReleaseBatch,
  batchLanguages,
  committedBatch,
  ReleasePatch,
  releaseOutputs,
  requestIssueNumber,
  validateReleaseDiff,
} from './source';

const Commit = Schema.Struct({
  sha: Sha,
  tree: Schema.Struct({ sha: Sha }),
  parents: Schema.Array(Schema.Struct({ sha: Sha })),
});
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
    const current = yield* activeRelease();
    if (Option.isSome(current)) return current.value.html_url;
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
    return pull.html_url;
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
  const issue = requestIssueNumber(batch);
  return Effect.gen(function* () {
    yield* commentIssue(pull.number, body);
    if (issue !== undefined) yield* commentIssue(issue, body);
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
    yield* verifyPublicationPolicy(batchLanguages(batch), appId);
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
}

export interface ReleaseRequestResult {
  readonly message: string;
  readonly batch?: ReleaseBatch;
  readonly pullRequest?: string;
}

export type PlanRelease<E, R> = () => Effect.Effect<SdkReleasePlan, E, R>;
export type ReleaseOutputs<E, R> = (
  ...args: Parameters<typeof releaseOutputs>
) => Effect.Effect<ReadonlyArray<string>, E, R>;

/** Opens the request issue for a dispatch-started release; issue-form requests already have one. */
const createRequestIssue = (run: string) =>
  Effect.map(
    request('POST', `${REPOSITORY_PATH}/issues`, Schema.Struct({ number: PositiveInt }), {
      title: `[SDK publication] Batch ${run}`,
      body: `Release requested from ${runUrl(run)}. The release PR, publication result and any failure are reported here.`,
    }),
    issue => issue.number
  );

/** Allocates a new batch unless a release PR is already open. */
const prepareRelease = <PE, PR, OE, OR>(
  context: ReleaseRequestContext,
  plan: PlanRelease<PE, PR>,
  outputs: ReleaseOutputs<OE, OR>
) =>
  Effect.gen(function* () {
    const cwd = (yield* Path.Path).resolve('.');
    const current = yield* activeRelease();
    if (Option.isSome(current))
      return {
        message: 'A release is already active; no competing versions were allocated.',
        pullRequest: current.value.html_url,
      } satisfies ReleaseRequestResult;
    // The registry baseline check in planning refuses while a merged release is unpublished.
    const selected = yield* plan();
    if (!selected.releases.length)
      return {
        message: 'Nothing to release. Stable registry baselines were reconciled.',
      } satisfies ReleaseRequestResult;
    const date = new Date().toISOString().slice(0, 10);
    const issue = context.issueNumber ?? (yield* createRequestIssue(context.runId));
    const batch = yield* Schema.decodeUnknownEffect(ReleaseBatch)({
      schemaVersion: 1,
      id: context.runId,
      originalRunId: context.runId,
      requestedBy: [context.actor],
      inputBase: context.sourceSha,
      date,
      statusUrl: `https://github.com/${SDK_RELEASE_REPOSITORY}/issues/${issue}`,
      plan: selected,
      outputs: yield* outputs(
        cwd,
        date,
        context.runId,
        new Set(selected.releases.map(release => release.language)),
        new Set(selected.releases.map(release => release.name))
      ),
    });
    return {
      message:
        'Release preparation authorized. The concrete release PR requires final-head approval and green checks.',
      batch,
    } satisfies ReleaseRequestResult;
  });

const ReleaseTag = Schema.Struct({
  ref: Schema.String,
  object: Schema.Struct({ type: Schema.Literal('commit'), sha: Sha }),
});
const RELEASE_TAG = /^refs\/tags\/sdk-release\/([1-9][0-9]*)$/;

/**
 * The newest tagged release's planned versions the registry baseline does not serve. Any lagging
 * Python package strands the whole Python lane, which shares one version.
 */
export const supersededRelease = (
  baseline: Record<string, string>,
  pythonPackages: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const tags = yield* Stream.runCollect(
      paginateArray(`${REPOSITORY_PATH}/git/matching-refs/tags/sdk-release/`, ReleaseTag)
    );
    const [newest] = tags
      .flatMap(tag => {
        const id = RELEASE_TAG.exec(tag.ref)?.[1];
        return id === undefined ? [] : [{ id, sha: tag.object.sha }];
      })
      .sort((a, b) => Number(b.id) - Number(a.id));
    if (newest === undefined) return yield* fail('No tagged SDK release to supersede');
    const batch = yield* committedBatch(newest.sha);
    if (Option.isNone(batch))
      return yield* fail(`sdk-release/${newest.id} has no committed release plan`);
    const stranded = batch.value.plan.releases
      .filter(release =>
        release.language === 'python'
          ? pythonPackages.some(name => baseline[name] !== release.newVersion)
          : baseline[release.name] !== release.newVersion
      )
      .map(({ name, oldVersion, newVersion, language }) => ({
        name,
        oldVersion,
        newVersion,
        language,
      }));
    if (!stranded.length)
      return yield* fail(
        `Nothing to supersede: every version planned by sdk-release/${newest.id} is published. Request the release without supersede.`
      );
    return { batchId: newest.id, releases: stranded } satisfies SupersedeInput;
  });

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
    return yield* Effect.gen(function* () {
      const result = yield* prepareRelease(context, plan, outputs);
      yield* reply(`${result.message}\n\n${result.pullRequest ?? runUrl(context.runId)}`);
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

const Mode = Schema.Literals(['authorize', 'commit', 'tag']);
type Mode = typeof Mode.Type;

const Environment = Config.all({
  token: Config.schema(Schema.NonEmptyString, 'SDK_RELEASE_TOKEN'),
  runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  eventPath: Config.String('GITHUB_EVENT_PATH'),
  eventName: Config.String('GITHUB_EVENT_NAME'),
  outputPath: Config.String('GITHUB_OUTPUT'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
  appId: Config.schema(PositiveIntFromString, 'SDK_RELEASE_APP_ID'),
});
type Environment = Config.Success<typeof Environment>;

const EventEnvelope = Schema.Struct({
  sender: Schema.Struct({ login: Schema.String }),
  issue: Schema.optionalKey(Schema.Struct({ number: PositiveInt })),
  pull_request: Schema.optionalKey(Schema.Struct({ number: PositiveInt })),
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
    const request = yield* Effect.try(() => parseReleaseRequest(env.eventName, event));
    const result = yield* executeReleaseRequest(
      request,
      {
        actor: envelope.sender.login,
        runId: env.runId,
        sourceSha: env.sha,
        ...(envelope.issue ? { issueNumber: envelope.issue.number } : {}),
      },
      () =>
        Effect.gen(function* () {
          const baseline = yield* fetchStableRegistryBaseline(cwd);
          const supersede = request.supersede
            ? yield* supersededRelease(
                baseline,
                (yield* discoverPythonPackages(cwd)).map(pkg => pkg.name)
              )
            : undefined;
          return yield* createSdkReleasePlan(cwd, {
            typescript: request.typescript,
            python: request.python,
            baseline,
            ...(supersede ? { supersede } : {}),
          });
        })
    );
    if (result.batch) {
      yield* (yield* FileSystem.FileSystem).writeFileString(
        'sdk-release-batch.json',
        formatJson(result.batch)
      );
      yield* appendFile(env.outputPath, 'prepare=true\n');
      // The prepare job reads the batch from this output; release-pr re-checks it against the artifact.
      const compact = JSON.stringify(result.batch);
      yield* ensure(compact.length < 900_000, 'Release batch exceeds the job output limit');
      yield* appendFile(env.outputPath, `batch=${compact}\n`);
    }
    yield* writeSummary(env, `${result.message}\n${result.pullRequest ?? ''}\n`);
  });

const MODES: Record<
  Mode,
  (input: ModeInput) => Effect.Effect<void, unknown, GitHub | ReleaseServices>
> = {
  authorize: authorizeMode,
  commit: commitMode,
  tag: tagMode,
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
