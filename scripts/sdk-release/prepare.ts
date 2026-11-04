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
  readJson,
  readOptionalFile,
  run,
  runMain,
  spawn,
  withoutReleaseTokens,
  writeFile,
} from './runtime';
import { BATCH_PATH, ReleaseBatch, ReleasePatch, validateReleaseDiff } from './source';

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

/** Applies a frozen release batch to a clean checkout and returns the reviewed file patch. */
export const prepareRelease = (cwd: string, input: ReleaseBatch) =>
  Effect.gen(function* () {
    const token = yield* Config.option(Config.String('SDK_RELEASE_TOKEN'));
    yield* ensure(
      Option.isNone(token) || token.value === '',
      'Preparation must not receive a controller credential'
    );
    const path = yield* Path.Path;
    const batch = yield* Schema.decodeUnknownEffect(ReleaseBatch)(input);
    yield* ensure(
      (yield* git(cwd, 'rev-parse', 'HEAD')).trim() === batch.inputBase,
      'Preparation checkout does not match the frozen input base'
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
      publicationStatusUrl: batch.statusUrl,
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
    yield* validateReleaseDiff(files, batch.plan, batch.outputs);
    return yield* Schema.decodeUnknownEffect(ReleasePatch)({ batch, files });
  });

const main = Effect.gen(function* () {
  const [batchPath] = yield* (yield* Stdio.Stdio).args;
  if (!batchPath) return yield* fail('Expected authorized batch JSON path');
  const cwd = (yield* Path.Path).resolve('.');
  const result = yield* prepareRelease(cwd, yield* readJson(ReleaseBatch, batchPath));
  const output = yield* Config.String('SDK_RELEASE_PATCH_PATH').pipe(
    Config.withDefault('/tmp/sdk-release-patch.json')
  );
  yield* writeFile(output, `${JSON.stringify(result)}\n`);
});

if (import.meta.main) runMain(main);
