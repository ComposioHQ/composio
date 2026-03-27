import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { Command } from '@effect/platform';
import { Cause, Console, Effect, Exit, Stream } from 'effect';
import type { Teardown } from '@effect/platform/Runtime';
import { RUN_COMPANION_MODULE_BASENAMES } from '../src/services/run-companion-modules';

/**
 * Shared teardown for all CLI scripts.
 *
 * Exits with a non-zero code when the Effect program fails
 * (unless the failure is an interrupt-only cause).
 */
export const teardown: Teardown = <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void) => {
  const shouldFail = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause);
  const errorCode = Number(process.exitCode ?? 1);
  onExit(shouldFail ? errorCode : 0);
};

type LoggedCommandArgs = readonly [string, ...string[]];

const runLoggedCommand = (args: LoggedCommandArgs) =>
  Command.make(...args).pipe(
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
    ),
    Effect.map(({ exitCode }) => exitCode)
  );

export const buildCompanionModules = (outputDir: string) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise(() => mkdir(outputDir, { recursive: true }));

    for (const name of RUN_COMPANION_MODULE_BASENAMES) {
      const args = [
        'bun',
        'build',
        `./src/services/${name}.ts`,
        '--outfile',
        `${outputDir}/${name}.mjs`,
        '--format',
        'esm',
        '--target',
        'bun',
      ] as const satisfies LoggedCommandArgs;

      const exitCode = yield* runLoggedCommand(args);
      if (exitCode !== 0) {
        return yield* Effect.fail(new Error(`Failed to build companion module: ${name}`));
      }
    }
  });
