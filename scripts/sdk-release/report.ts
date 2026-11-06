import { Config, Console, Effect, Schema, Stdio } from 'effect';
import semver from 'semver';
import { GitHub, RunId, commentIssue, jobs, runUrl } from './github';
import { packageLabel } from './release-pr';
import { appendFile, readJson, runMain } from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';

/**
 * Posts the published versions on the request issue and returns the released npm versions,
 * which the docs job pins.
 */
export const reportRelease = (batch: ReleaseBatch, runId: string) =>
  Effect.gen(function* () {
    yield* commentIssue(
      batch.issue,
      [
        `Published by ${runUrl(runId)}:`,
        '',
        ...batch.plan.releases.map(
          release => `- ${packageLabel(release.name)} ${release.newVersion}`
        ),
      ].join('\n')
    );
    return Object.fromEntries(
      batch.plan.releases
        .filter(release => release.language === 'typescript')
        .map(release => [release.name, release.newVersion])
    );
  });

/** Posts the failed jobs of this run attempt and the recovery step on the request issue. */
export const reportFailure = (batch: ReleaseBatch, runId: string) =>
  Effect.gen(function* () {
    const failed = (yield* jobs(runId, 'latest'))
      .filter(job => job.conclusion === 'failure')
      .map(job => job.name);
    yield* commentIssue(
      batch.issue,
      [
        `The release run failed in: ${failed.join(', ')}.`,
        `Open ${runUrl(runId)} and choose "Re-run failed jobs". A re-run uploads only the files the registries are missing.`,
        'If the approved candidates expired or a registry already serves different bytes, add changesets for the affected packages and request a new release; it moves them to the next version.',
      ].join('\n\n')
    );
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

/** `report.ts docs-pins <docs package.json>` prints the specs for `bun add`; reads `RELEASED`. */
const docsPins = (manifestPath: string) =>
  Effect.gen(function* () {
    const released = yield* Config.schema(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
      'RELEASED'
    );
    const { devDependencies } = yield* readJson(DocsManifest, manifestPath);
    yield* Console.log(docsPinSpecs(released, devDependencies).join(' '));
  });

/** `report.ts released` or `report.ts failed`, run from the tag checkout. */
const main = Effect.gen(function* () {
  const args = yield* (yield* Stdio.Stdio).args;
  if (args[0] === 'docs-pins') return yield* docsPins(args[1] ?? '');
  const [mode] = yield* Schema.decodeUnknownEffect(
    Schema.Tuple([Schema.Literals(['released', 'failed'])])
  )(args);
  const env = yield* Config.all({
    token: Config.schema(Schema.NonEmptyString, 'GITHUB_TOKEN'),
    runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
    output: Config.String('GITHUB_OUTPUT'),
  });
  const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
  yield* Effect.gen(function* () {
    if (mode === 'failed') return yield* reportFailure(batch, env.runId);
    const npm = yield* reportRelease(batch, env.runId);
    if (Object.keys(npm).length) yield* appendFile(env.output, `npm=${JSON.stringify(npm)}\n`);
  }).pipe(Effect.provide(GitHub.layer(env.token)));
});

if (import.meta.main) runMain(main);
