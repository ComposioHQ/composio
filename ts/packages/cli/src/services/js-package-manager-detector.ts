import { BunFileSystem } from '@effect/platform-bun';
import { Data, Effect, Option, Schema, pipe } from 'effect';
import { FileSystem } from '@effect/platform';
import * as path from 'path';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Error thrown when a package manager detection fails.
 */
export class JsPackageManagerError extends Data.TaggedError('services/JsPackageManagerError')<{
  readonly cause: Error;
  readonly message: string;
}> {}

/**
 * Valid JavaScript package manager names recognised by Composio.
 */
export type PackageManager = 'pnpm' | 'bun' | 'yarn' | 'npm';

const LOCK_FILES: Record<PackageManager, string> = {
  pnpm: 'pnpm-lock.yaml',
  bun: 'bun.lockb',
  yarn: 'yarn.lock',
  npm: 'package-lock.json',
};

const PM_PREFERENCE: PackageManager[] = ['pnpm', 'bun', 'yarn', 'npm'];

// Service that attempts to detect the package manager of the project in the current working directory.
export class JsPackageManagerDetector extends Effect.Service<JsPackageManagerDetector>()(
  'services/JsPackageManagerDetector',
  {
    accessors: true,
    effect: Effect.gen(function* () {
      yield* Effect.logDebug('[JsPackageManagerDetector] Identifying JS package manager...');

      const fs = yield* FileSystem.FileSystem;

      const parsePackageManager = (pm: string): Option.Option<PackageManager> => {
        if (pm.startsWith('pnpm@')) return Option.some('pnpm');
        if (pm.startsWith('bun@')) return Option.some('bun');
        if (pm.startsWith('yarn@')) return Option.some('yarn');
        if (pm.startsWith('npm@')) return Option.some('npm');
        return Option.none();
      };

      const PackageJsonSchema = Schema.Struct({
        packageManager: Schema.optional(Schema.String),
      }).annotations({ identifier: 'package.json' });

      const detectFromPackageJson = (
        cwd: string
      ): Effect.Effect<Option.Option<PackageManager>, JsPackageManagerError> =>
        Effect.gen(function* () {
          const contentEffect = pipe(
            fs.readFileString(path.join(cwd, 'package.json')),
            Effect.catchTag('SystemError', e =>
              Effect.fail(
                new JsPackageManagerError({ cause: e, message: 'Failed to read package.json' })
              )
            )
          );

          const content = yield* Effect.option(contentEffect);

          if (Option.isNone(content)) {
            return Option.none();
          }

          const json = yield* Effect.try({
            try: () => JSON.parse(content.value) as unknown,
            catch: e =>
              new JsPackageManagerError({
                cause: toError(e),
                message: 'Failed to parse package.json',
              }),
          });

          const decoded = yield* pipe(
            Schema.decodeUnknown(PackageJsonSchema)(json),
            Effect.mapError(
              e =>
                new JsPackageManagerError({
                  cause: toError(e),
                  message: 'Failed to decode package.json',
                })
            )
          );

          return Option.fromNullable(decoded.packageManager).pipe(
            Option.flatMap(parsePackageManager)
          );
        });

      const detectRecursive = (
        cwd: string
      ): Effect.Effect<Option.Option<PackageManager>, JsPackageManagerError> =>
        Effect.gen(function* () {
          const fromPackageJson = yield* detectFromPackageJson(cwd);
          if (Option.isSome(fromPackageJson)) {
            return fromPackageJson;
          }

          const parentDir = path.dirname(cwd);
          if (parentDir === cwd) {
            return Option.none();
          }

          return yield* detectRecursive(parentDir);
        });

      const detectJsPackageManager = (
        cwd: string
      ): Effect.Effect<PackageManager, JsPackageManagerError> =>
        Effect.gen(function* () {
          const files = yield* pipe(
            fs.readDirectory(cwd),
            Effect.mapError(
              e =>
                new JsPackageManagerError({
                  cause: toError(e),
                  message: `Failed to read directory ${cwd}`,
                })
            )
          );

          const fileNames = files.map(f => f.toLowerCase());

          for (const pm of PM_PREFERENCE) {
            if (fileNames.includes(LOCK_FILES[pm])) {
              return pm;
            }
          }

          const result = yield* detectRecursive(cwd);

          if (Option.isSome(result)) {
            return result.value;
          }

          return yield* Effect.fail(
            new JsPackageManagerError({
              cause: new Error('Recursive lookup exhausted'),
              message: 'Failed to detect package manager',
            })
          );
        });

      return {
        detectJsPackageManager,
      };
    }),
    dependencies: [BunFileSystem.layer],
  }
) {}
