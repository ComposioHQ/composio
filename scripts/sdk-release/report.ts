import { Config, Console, Effect, Option, Schema, Stdio, Stream } from 'effect';
import semver from 'semver';
import {
  GitHub,
  PositiveInt,
  REPOSITORY_PATH,
  RunId,
  paginateArray,
  request,
  runUrl,
} from './github';
import { REGISTRY_VERSION } from './lanes';
import { packageLabel } from './release-pr';
import { appendFile, ensure, readJson, runMain } from './runtime';
import { BATCH_PATH, ReleaseBatch, channelOf } from './source';
import { DISPLAY, ReleaseState, STATUS_LABELS, Stage, describe, endsStage } from './state';

/** Status comments come from the workflow token, so nobody else's comment is ever edited. */
const STATUS_AUTHOR = 'github-actions[bot]';
const STATUS_MARKER = '<!-- sdk-release-status';
const marker = (stage: Stage) => `${STATUS_MARKER} stage=${stage} -->`;
const MARKED_STAGE = /^<!-- sdk-release-status stage=(request|review|publish) -->/;
const STAGE_ORDER = Stage.literals;

const IssueComment = Schema.Struct({
  id: PositiveInt,
  body: Schema.optionalKey(Schema.NullOr(Schema.String)),
  user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
});
const IssueLabel = Schema.Struct({ name: Schema.String });
const Written = Schema.Unknown;

/**
 * Shows `state` on the request issue: one status comment edited in place, one status label, and
 * the issue closed once the release can no longer advance. The comment records which stage wrote
 * it, so a late or re-run earlier stage never replaces a later stage's result; nothing else is
 * read back.
 */
export const showStatus = (issue: number, state: ReleaseState, run: string, stage: Stage) =>
  Effect.gen(function* () {
    const display = DISPLAY[state._tag];
    const body = `${marker(stage)}\n**SDK release: ${display.label.replace('sdk-release:', '')}**\n\n${describe(state)}\n\n<sub>Updated by ${runUrl(run)}</sub>`;
    const issuePath = `${REPOSITORY_PATH}/issues/${issue}`;
    const existing = yield* paginateArray(`${issuePath}/comments`, IssueComment).pipe(
      Stream.filter(
        comment =>
          comment.user?.login === STATUS_AUTHOR && (comment.body ?? '').startsWith(STATUS_MARKER)
      ),
      Stream.runHead
    );
    const shown = Option.flatMap(existing, comment =>
      Option.fromNullishOr(MARKED_STAGE.exec(comment.body ?? '')?.[1] as Stage | undefined)
    );
    const later = Option.filter(
      shown,
      shownStage => STAGE_ORDER.indexOf(shownStage) > STAGE_ORDER.indexOf(stage)
    );
    if (Option.isSome(later))
      return yield* Console.log(`The ${later.value} stage already reported; keeping its status`);
    yield* Option.match(existing, {
      onSome: comment =>
        request('PATCH', `${REPOSITORY_PATH}/issues/comments/${comment.id}`, Written, { body }),
      onNone: () => request('POST', `${issuePath}/comments`, Written, { body }),
    });
    const labels = yield* Stream.runCollect(paginateArray(`${issuePath}/labels`, IssueLabel));
    for (const { name } of labels.filter(
      label => STATUS_LABELS.includes(label.name) && label.name !== display.label
    ))
      yield* request('DELETE', `${issuePath}/labels/${encodeURIComponent(name)}`, Written);
    yield* request('POST', `${issuePath}/labels`, Written, { labels: [display.label] });
    if (display.close)
      yield* request('PATCH', issuePath, Written, { state: 'closed', state_reason: display.close });
  });

/** A job's result as GitHub reports it to the jobs that need it. */
const JobResult = Schema.Literals(['success', 'failure', 'cancelled', 'skipped']);
const Results = Schema.Record(Schema.String, JobResult);

/**
 * The state a stage ended in: `Failed` when any of its jobs failed or was cancelled, otherwise
 * the state its last job recorded. The publish stage records nothing, because reaching the end
 * with every job green is what `Published` means.
 */
export const stageOutcome = <E, R>(
  stage: Stage,
  results: Readonly<Record<string, typeof JobResult.Type>>,
  recorded: Option.Option<ReleaseState>,
  published: Effect.Effect<ReleaseState, E, R>,
  run: string
) =>
  Effect.gen(function* () {
    const failed = Object.entries(results)
      .filter(([, result]) => result === 'failure' || result === 'cancelled')
      .map(([job]) => job);
    const state = failed.length
      ? ReleaseState.make({ _tag: 'Failed', stage, jobs: failed, run: runUrl(run) })
      : yield* Option.match(recorded, { onSome: Effect.succeed, onNone: () => published });
    yield* ensure(endsStage(stage, state), `The ${stage} stage cannot end in ${state._tag}`);
    return state;
  });

/** Every planned package and its new version, as the status comment lists them. */
const publishedState = (batch: ReleaseBatch) =>
  ReleaseState.make({
    _tag: 'Published',
    versions: batch.plan.releases.map(release => ({
      name: packageLabel(release.name),
      version: REGISTRY_VERSION[release.language](release.newVersion),
    })),
  });

/**
 * A job output the status job reads. GitHub passes an output that a failed or skipped job never
 * wrote as an empty string, so empty means absent.
 */
export const jobOutput = <A, E>(decode: (text: string) => Effect.Effect<A, E>, text: string) =>
  text === '' ? Effect.succeedNone : Effect.asSome(decode(text));

export const StatusEnvironment = Config.all({
  token: Config.schema(Schema.NonEmptyString, 'GITHUB_TOKEN'),
  runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
  results: Config.schema(Schema.fromJsonString(Results), 'RESULTS'),
  outcome: Config.String('OUTCOME').pipe(Config.withDefault('')),
  issue: Config.String('ISSUE').pipe(Config.withDefault('')),
});

/**
 * `report.ts status <stage>` runs last in every stage, even after a failure or cancellation. It
 * writes the outcome to the run summary and shows it on the request issue when there is one.
 */
const statusMode = (stage: Stage) =>
  Effect.gen(function* () {
    const env = yield* StatusEnvironment;
    const issue = yield* jobOutput(
      Schema.decodeUnknownEffect(Schema.NumberFromString.check(Schema.isInt())),
      env.issue
    );
    const state = yield* stageOutcome(
      stage,
      env.results,
      yield* jobOutput(
        Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseState)),
        env.outcome
      ),
      Effect.map(readJson(ReleaseBatch, BATCH_PATH), publishedState),
      env.runId
    );
    yield* appendFile(env.summaryPath, `${describe(state)}\n`);
    yield* Option.match(issue, {
      onNone: () => Console.log('No request issue to update'),
      onSome: issue =>
        showStatus(issue, state, env.runId, stage).pipe(Effect.provide(GitHub.layer(env.token))),
    });
  });

/**
 * The `name@version` specs that move the docs to the released npm versions. Packages the docs do
 * not use, and pins already at or past the release (an older release's retry), are left alone.
 */
export const docsPinSpecs = (
  released: Readonly<Record<string, string>>,
  devDependencies: Readonly<Record<string, string>>
) =>
  Object.entries(released)
    .filter(([name, version]) => {
      const pinned = semver.minVersion(devDependencies[name] ?? '');
      return name in devDependencies && (pinned === null || semver.gt(version, pinned));
    })
    .map(([name, version]) => `${name}@${version}`);

const DocsManifest = Schema.Struct({
  devDependencies: Schema.Record(Schema.String, Schema.String),
});

/**
 * `report.ts docs-pins <docs package.json>` prints the `bun add` specs for this tag's npm
 * release. A beta prints nothing: the docs follow stable releases only.
 */
const docsPinsMode = (manifestPath: string) =>
  Effect.gen(function* () {
    const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
    const released = Object.fromEntries(
      batch.plan.releases
        .filter(release => channelOf(batch).pinsDocs && release.language === 'typescript')
        .map(release => [release.name, release.newVersion])
    );
    const { devDependencies } = yield* readJson(DocsManifest, manifestPath);
    yield* Console.log(docsPinSpecs(released, devDependencies).join(' '));
  });

const Arguments = Schema.Union([
  Schema.Tuple([Schema.Literal('status'), Stage]),
  Schema.Tuple([Schema.Literal('docs-pins'), Schema.String]),
]);

const main = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Arguments)(yield* (yield* Stdio.Stdio).args);
  yield* args[0] === 'status' ? statusMode(args[1]) : docsPinsMode(args[1]);
});

if (import.meta.main) runMain(main);
