import { Config, Effect, FileSystem, Option, Schema, Stdio } from 'effect';
import {
  GitHub,
  REPOSITORY_PATH,
  RunId,
  SDK_RELEASE_REPOSITORY,
  Sha,
  commentIssue,
  jobs,
  request,
  requestOptional,
  type ReleaseRun,
} from './github';
import { packageLabel } from './release-pr';
import { fail, runMain } from './runtime';
import { committedBatch, requestIssueNumber } from './source';

export const RELEASE_WORKFLOW_PATH = '.github/workflows/sdk.release.yml';
const RELEASE_TAG = /^sdk-release\/\d+$/;

const App = Schema.Struct({ id: Schema.Number, slug: Schema.String });
const TagRef = Schema.Struct({ object: Schema.Struct({ type: Schema.String, sha: Sha }) });

export interface ReleaseApp {
  readonly id: number;
  readonly slug: string;
}

/**
 * Why `run` is not a release tag run, or `undefined` when it is one: a `push` run of the release
 * workflow for an `sdk-release/*` tag, pushed by the release App, whose tag still points at the
 * run's commit.
 */
export const tagRunProblem = (run: ReleaseRun, expectedApp: ReleaseApp) =>
  Effect.gen(function* () {
    if (
      run.path !== RELEASE_WORKFLOW_PATH ||
      run.repository.full_name !== SDK_RELEASE_REPOSITORY ||
      run.event !== 'push' ||
      !RELEASE_TAG.test(run.head_branch ?? '') ||
      run.head_sha === undefined
    )
      return 'Publication requires the original protected source-tag push';
    const app = yield* request('GET', `/apps/${encodeURIComponent(expectedApp.slug)}`, App);
    if (
      app.id !== expectedApp.id ||
      app.slug !== expectedApp.slug ||
      run.actor?.type !== 'Bot' ||
      run.actor.login !== `${app.slug}[bot]`
    )
      return 'Publication source tag was not pushed by the dedicated SDK release App';
    const tag = yield* requestOptional(
      `${REPOSITORY_PATH}/git/ref/tags/${run.head_branch}`,
      TagRef
    );
    if (
      Option.isNone(tag) ||
      tag.value.object.type !== 'commit' ||
      tag.value.object.sha !== run.head_sha
    )
      return 'Publication tag source changed';
    return undefined;
  });

/** The batch tagged at `sha` and the number of the request issue it reports to. */
const requestIssueAt = (sha: string) =>
  Effect.gen(function* () {
    const batch = yield* committedBatch(sha);
    if (Option.isNone(batch)) return yield* fail('The tagged commit has no release batch');
    const issue = requestIssueNumber(batch.value);
    if (issue === undefined) return yield* fail('The release batch names no request issue');
    return { batch: batch.value, issue };
  });

const runUrl = (runId: string) =>
  `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${runId}`;

/** Posts the published versions and the run link on the request issue. */
export const reportRelease = (sha: string, runId: string) =>
  Effect.gen(function* () {
    const { batch, issue } = yield* requestIssueAt(sha);
    const body = [
      `Published and verified by ${runUrl(runId)}:`,
      '',
      ...batch.plan.releases.map(
        release => `- ${packageLabel(release.name)} ${release.newVersion}`
      ),
    ].join('\n');
    yield* commentIssue(issue, body);
    return body;
  });

/** Posts the failed jobs of this run attempt and the recovery step on the request issue. */
export const reportFailure = (sha: string, runId: string) =>
  Effect.gen(function* () {
    const { issue } = yield* requestIssueAt(sha);
    const failed = (yield* jobs(runId, 'latest'))
      .filter(job => job.conclusion === 'failure')
      .map(job => job.name);
    const body = [
      `The release run failed in: ${failed.join(', ')}.`,
      `Open ${runUrl(runId)} and choose "Re-run failed jobs". A re-run uploads only the files the registries are missing.`,
    ].join('\n\n');
    yield* commentIssue(issue, body);
    return body;
  });

const REPORTS = { released: reportRelease, failed: reportFailure } as const;

const main = Effect.gen(function* () {
  const [argument] = yield* (yield* Stdio.Stdio).args;
  const mode = yield* Schema.decodeUnknownEffect(Schema.Literals(['released', 'failed']))(argument);
  const env = yield* Config.all({
    token: Config.schema(Schema.NonEmptyString, 'GITHUB_TOKEN'),
    runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
    sha: Config.schema(Sha, 'GITHUB_SHA'),
    summary: Config.String('GITHUB_STEP_SUMMARY'),
  });
  const body = yield* REPORTS[mode](env.sha, env.runId).pipe(
    Effect.provide(GitHub.layer(env.token))
  );
  yield* (yield* FileSystem.FileSystem).writeFileString(env.summary, `${body}\n`, { flag: 'a' });
});

if (import.meta.main) runMain(main);
