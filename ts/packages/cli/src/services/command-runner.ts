import { Context, Effect, Layer, Stream } from 'effect';
import type * as PlatformError from 'effect/PlatformError';
import type { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Drains a child-process output stream into one string; shared with the run-helpers runtime. */
export const collectText = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

export interface CommandRunnerShape {
  readonly run: (
    command: ChildProcess.Command
  ) => Effect.Effect<number, PlatformError.PlatformError, ChildProcessSpawner.ChildProcessSpawner>;
  readonly capture: (
    command: ChildProcess.Command
  ) => Effect.Effect<
    CommandResult,
    PlatformError.PlatformError,
    ChildProcessSpawner.ChildProcessSpawner
  >;
}

const makeCommandRunner = Effect.sync((): CommandRunnerShape => ({
  run: command =>
    Effect.scoped(
      Effect.gen(function* () {
        const childProcess = yield* command;
        return Number(yield* childProcess.exitCode);
      })
    ),
  capture: command =>
    Effect.scoped(
      Effect.gen(function* () {
        const childProcess = yield* command;
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [
            childProcess.exitCode,
            collectText(childProcess.stdout),
            collectText(childProcess.stderr),
          ],
          { concurrency: 'unbounded' }
        );
        return { exitCode: Number(exitCode), stdout, stderr } satisfies CommandResult;
      })
    ),
}));

export class CommandRunner extends Context.Service<CommandRunner, CommandRunnerShape>()(
  'services/CommandRunner'
) {
  static readonly Default: Layer.Layer<CommandRunner> = Layer.effect(
    CommandRunner,
    makeCommandRunner
  );
}
