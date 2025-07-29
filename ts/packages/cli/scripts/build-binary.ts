import process from 'node:process';
import {
  Cause,
  Config,
  ConfigProvider,
  Console,
  Effect,
  Exit,
  Stream,
  Logger,
  Layer,
  LogLevel,
} from 'effect';
import { Command } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import type { Teardown } from '@effect/platform/Runtime';

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
      return yield* Effect.logInfo('Failed to build binary');
    }

    yield* Effect.logDebug('', 'Binary built successfully');
  });
}

export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

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
