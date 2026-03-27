import process from 'node:process';
import { Config, ConfigProvider, Console, Effect, Stream, Logger, Layer, LogLevel } from 'effect';
import { Command } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { RUN_COMPANION_MODULE_BASENAMES } from '../src/services/run-companion-modules';
import { teardown } from './_shared';

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

    const cmd = Command.make(...args);

    yield* Effect.logDebug('Running build command with', args.join(' '), '');

    const { exitCode } = yield* cmd.pipe(
      Command.start,
      Effect.flatMap(process =>
        Effect.all(
          {
            exitCode: process.exitCode,
            output: Stream.merge(
              Stream.decodeText(process.stdout, 'utf-8'),
              Stream.decodeText(process.stderr, 'utf-8'),
              { haltStrategy: 'left' }
            ).pipe(
              Stream.tap(chunk => Console.log(chunk)),
              Stream.runDrain
            ),
          },
          {
            concurrency: 'unbounded',
          }
        )
      )
    );

    process.exitCode = exitCode;

    if (exitCode !== 0) {
      return yield* Effect.fail(new Error('Failed to build binary'));
    }

    yield* Effect.logDebug('', 'Binary built successfully');

    // Build companion modules that `composio run` imports in the child process.
    // These cannot live inside the compiled binary because they run in a separate
    // Bun process via the --preload globals file.
    for (const name of RUN_COMPANION_MODULE_BASENAMES) {
      const companionArgs = [
        'bun',
        'build',
        `./src/services/${name}.ts`,
        '--outfile',
        `./dist/${name}.mjs`,
        '--format',
        'esm',
        '--target',
        'bun',
      ] as const satisfies ReadonlyArray<string>;

      yield* Effect.logDebug(`Building companion module: ${name}`);

      const companionCmd = Command.make(...companionArgs);
      const { exitCode: companionExitCode } = yield* companionCmd.pipe(
        Command.start,
        Effect.flatMap(p =>
          Effect.all(
            {
              exitCode: p.exitCode,
              output: Stream.merge(
                Stream.decodeText(p.stdout, 'utf-8'),
                Stream.decodeText(p.stderr, 'utf-8'),
                { haltStrategy: 'left' }
              ).pipe(
                Stream.tap(chunk => Console.log(chunk)),
                Stream.runDrain
              ),
            },
            { concurrency: 'unbounded' }
          )
        )
      );

      if (companionExitCode !== 0) {
        return yield* Effect.fail(new Error(`Failed to build companion module: ${name}`));
      }
    }

    yield* Effect.logDebug('', 'Companion modules built successfully');
  });
}

const ConfigLive = Effect.gen(function* () {
  const logLevel = yield* Config.logLevel('COMPOSIO_LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info)
  );

  return Logger.minimumLogLevel(logLevel);
}).pipe(Layer.unwrapEffect, Layer.merge(Layer.setConfigProvider(ConfigProvider.fromEnv())));

if (require.main === module) {
  buildBinary().pipe(
    Effect.provide(ConfigLive),
    Effect.provide(Logger.pretty),
    Effect.provide(BunContext.layer),
    Effect.scoped,
    Effect.map(() => ({ message: 'Process completed successfully.' })),
    BunRuntime.runMain({
      teardown,
    })
  );
}
