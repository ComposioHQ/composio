import { Config, Effect, Option, Path, Schema, Stdio } from 'effect';
import {
  generateSdkReleaseNotes,
  generateSdkReleaseReferences,
} from '../../docs/scripts/generate-sdk-release-notes';
import { applySdkReleasePlan } from './plan';
import {
  ensure,
  fail,
  formatJson,
  readOptionalFile,
  run,
  runMain,
  spawn,
  withoutReleaseTokens,
  writeFile,
} from './runtime';
import {
  BATCH_PATH,
  ReleaseBatch,
  ReleasePatch,
  issueUrl,
  releaseOutputs,
  validateReleaseDiff,
} from './source';

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  run('git', args, { cwd, env: withoutReleaseTokens });

const nulSeparated = (output: string) => output.split('\0').filter(Boolean);

/** A changed path's contents at the frozen input base and in the prepared checkout. */
const releaseFile = (cwd: string, inputBase: string, file: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const original = yield* spawn('git', ['show', `${inputBase}:${file}`], {
      cwd,
      env: withoutReleaseTokens,
    });
    return {
      path: file,
      before: original.exitCode === 0 ? original.stdout : null,
      after: Option.getOrNull(yield* readOptionalFile(path.resolve(cwd, file))),
    };
  });

/** Applies a planned batch to a clean checkout of its source and returns the changed files. */
export const prepareRelease = (cwd: string, batch: ReleaseBatch) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* ensure(
      (yield* git(cwd, 'rev-parse', 'HEAD')).trim() === batch.inputBase,
      'Preparation checkout does not match the planned source'
    );
    yield* ensure(
      (yield* git(cwd, 'status', '--porcelain')).trim() === '',
      'Preparation requires a clean source checkout'
    );
    yield* applySdkReleasePlan(cwd, batch.plan);
    yield* run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
      cwd,
      env: withoutReleaseTokens,
    });
    yield* generateSdkReleaseReferences(cwd, batch.plan);
    yield* generateSdkReleaseNotes(cwd, batch.plan, {
      releaseId: batch.id,
      date: batch.date,
      requestUrl: issueUrl(batch),
    });
    yield* writeFile(path.resolve(cwd, BATCH_PATH), formatJson(batch));
    const changed = new Set([
      ...nulSeparated(yield* git(cwd, 'diff', '--name-only', '-z', batch.inputBase)),
      ...nulSeparated(yield* git(cwd, 'ls-files', '--others', '--exclude-standard', '-z')),
    ]);
    const files = yield* Effect.forEach(
      [...changed].sort(),
      file => releaseFile(cwd, batch.inputBase, file),
      { concurrency: 8 }
    );
    yield* validateReleaseDiff(files, batch.plan, yield* releaseOutputs(cwd, batch));
    return yield* Schema.decodeUnknownEffect(ReleasePatch)({ files });
  });

/** `prepare.ts <patch-path>` with the planned batch in `SDK_RELEASE_BATCH`. */
const main = Effect.gen(function* () {
  const [output] = yield* (yield* Stdio.Stdio).args;
  if (!output) return yield* fail('Expected the patch output path');
  const token = yield* Config.option(Config.String('SDK_RELEASE_TOKEN'));
  yield* ensure(
    Option.isNone(token) || token.value === '',
    'Preparation must not receive a controller credential'
  );
  const batch = yield* Config.schema(Schema.fromJsonString(ReleaseBatch), 'SDK_RELEASE_BATCH');
  const patch = yield* prepareRelease((yield* Path.Path).resolve('.'), batch);
  yield* writeFile(output, `${JSON.stringify(patch)}\n`);
});

if (import.meta.main) runMain(main);
