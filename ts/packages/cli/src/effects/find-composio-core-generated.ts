import path from 'node:path';
import { Command, FileSystem } from '@effect/platform';
import { Data, Effect, Match, Option } from 'effect';
import {
  JsPackageManagerDetector,
  type PackageManager,
} from 'src/services/js-package-manager-detector';

export class ComposioCorePkgNotFound extends Data.TaggedError('error/ComposioCorePkgNotFound')<{
  readonly message: string;
  readonly cause: string;
  readonly fix?: string;
}> {}

export function pyFindComposioCoreGenerated(cwd: string) {
  return Effect.gen(function* () {
    /**
     * Returns a `ComposioCorePkgNotFound` error with the given message and cause.
     * It lazily identifies the package manager used by the user to tell them how to install `@composio/core`.
     */
    const onError = (message: string) => (e: Error | string) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('Identifying JS package manager...');
        const pkgManagerDetector = yield* JsPackageManagerDetector;
        const pkgManager = yield* pkgManagerDetector.detectJsPackageManager(cwd).pipe(
          Effect.andThen(pkgManager => pkgManager),
          Effect.tapError(e => Effect.logError(e)),
          Effect.catchAll(() => Effect.succeed('npm' as PackageManager))
        );

        yield* Effect.logDebug({ pkgManager });

        const installCmd = `uv pip install`;

        const fix = `Install \`composio-core\` with \`${installCmd} composio-core\`, or specify an output directory using \`--output-dir\``;

        return yield* Effect.fail(
          new ComposioCorePkgNotFound({
            cause: e instanceof Error ? e.message : e,
            fix,
            message,
          })
        );
      }) satisfies Effect.Effect<never, ComposioCorePkgNotFound, JsPackageManagerDetector>;

    // Try to find `composio-core` in the current `uv` environment
    // Try to find `composio-core` in the current `uv` environment
    const [cmd, ...args] = [
      'uv',
      'run',
      '--active',
      'python',
      '-c',
      'import composio; print(composio.__file__)',
    ];

    const stdout = yield* Command.make(cmd, ...args).pipe(
      Command.string,
      Effect.catchAll(e => onError('Failed to locate composio-core in uv environment')(e))
    );

    yield* Effect.logDebug({ stdout, cmd: [cmd, ...args].join(' ') });

    const composioCorePath = path.dirname(stdout);
    yield* Effect.logDebug({ composioCorePath });

    return composioCorePath;
  }) satisfies Effect.Effect<string, ComposioCorePkgNotFound, unknown>;
}

/**
 * Returns the path to `@composio/core/generated` inside the user's project, if it exists.
 * The search is scoped to the given current working directory.
 */
export function jsFindComposioCoreGenerated(cwd: string) {
  return Effect.gen(function* () {
    /**
     * Returns a `ComposioCorePkgNotFound` error with the given message and cause.
     * It lazily identifies the package manager used by the user to tell them how to install `@composio/core`.
     */
    const onError = (message: string) => (e: Error | string) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('Identifying JS package manager...');
        const pkgManagerDetector = yield* JsPackageManagerDetector;
        const pkgManager = yield* pkgManagerDetector.detectJsPackageManager(cwd).pipe(
          Effect.andThen(pkgManager => pkgManager),
          Effect.tapError(e => Effect.logError(e)),
          Effect.catchAll(() => Effect.succeed('npm' as PackageManager))
        );

        yield* Effect.logDebug({ pkgManager });

        const installCmd = Match.value(pkgManager).pipe(
          Match.when('pnpm', () => 'pnpm add'),
          Match.when('bun', () => 'bun add'),
          Match.when('yarn', () => 'yarn add'),
          Match.when('npm', () => 'npm install -S'),
          Match.exhaustive
        );

        const fix = `Install @composio/core with \`${installCmd} @composio/core\`, or specify an output directory using \`--output-dir\``;

        return yield* Effect.fail(
          new ComposioCorePkgNotFound({
            cause: e instanceof Error ? e.message : e,
            fix,
            message,
          })
        );
      }) satisfies Effect.Effect<never, ComposioCorePkgNotFound, JsPackageManagerDetector>;

    const fs = yield* FileSystem.FileSystem;

    // First, try to find @composio/core in node_modules
    const nodeModulesPath = path.join(cwd, 'node_modules', '@composio', 'core');
    const nodeModulesExists = yield* fs
      .exists(nodeModulesPath)
      .pipe(
        Effect.catchAll(e =>
          Effect.flip(onError('@composio/core not readable in `node_modules`')(e))
        )
      );

    if (nodeModulesExists) {
      return path.join(nodeModulesPath, 'generated');
    }

    return yield* onError('@composio/core not found')('@composio/core not installed');
  }) satisfies Effect.Effect<string, ComposioCorePkgNotFound, unknown>;
}
