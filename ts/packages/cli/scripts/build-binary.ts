import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Stream, Logger, Layer, References } from 'effect';
import { ChildProcess as Command } from 'effect/unstable/process';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { buildCompanionModules, copyLocalToolBinaryAssets, teardown } from './_shared';
import { BinaryBuildError } from './build-error';

/**
 * Usage: `bun scripts/build-binary.ts`
 */
export function buildBinary() {
  return Effect.gen(function* () {
    const cwd = process.cwd();
    yield* Effect.logDebug(`Building binary in ${cwd}`);

    const args = [
      'bun',
      /**
       * Transpile and bundle the CLI app.
       */
      'build',
      './src/bin.ts',

      /**
       * Statically inline any environment variable that matches `DEBUG_OVERRIDE_*`.
       */
      '--env',
      'DEBUG_OVERRIDE_*',

      /**
       * Generate a standalone Bun executable containing your bundled code.
       */
      '--compile',
      '--production',

      /**
       * Output file destination.
       */
      '--outfile',
      './dist/composio',
    ] as const satisfies ReadonlyArray<string>;

    yield* Effect.logDebug('Running build command with', args.join(' '), '');

    const child = yield* Command.make(args[0], args.slice(1));

    const { exitCode } = yield* Effect.all(
      {
        exitCode: child.exitCode,
        output: Stream.merge(
          Stream.decodeText(child.stdout, { encoding: 'utf-8' }),
          Stream.decodeText(child.stderr, { encoding: 'utf-8' }),
          { haltStrategy: 'left' }
        ).pipe(
          Stream.tap(chunk => Console.log(chunk)),
          Stream.runDrain
        ),
      },
      {
        concurrency: 'unbounded',
      }
    );

    process.exitCode = exitCode;

    if (exitCode !== 0) {
      return yield* new BinaryBuildError({
        message: 'Failed to build binary',
        exitCode,
      });
    }

    yield* Effect.logDebug('', 'Binary built successfully');

    // Build companion modules that `composio run` imports in the child process.
    // These cannot live inside the compiled binary because they run in a separate
    // Bun process via the --preload globals file.
    yield* buildCompanionModules('./dist');

    yield* Effect.logDebug('', 'Companion modules built successfully');

    // Copy local-tool executable/library assets next to the standalone CLI so
    // command and FFI local tools can resolve platform-specific bundled binaries
    // at runtime.
    yield* copyLocalToolBinaryAssets('./dist');
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(Config.withDefault('Info'));

  return Layer.succeed(References.MinimumLogLevel, logLevel);
}).pipe(Layer.unwrap, Layer.merge(ConfigProvider.layer(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildBinary().pipe(
    Effect.provide(ConfigLive),
    Effect.provide(Logger.layer([Logger.consolePretty()])),
    Effect.provide(BunServices.layer),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
