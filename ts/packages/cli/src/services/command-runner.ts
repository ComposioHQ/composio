import { Context, Effect, Layer, PlatformError, Stream, String } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const collectText = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(() => String.empty, String.concat)
  );

export class CommandRunner extends Context.Service<
  CommandRunner,
  {
    readonly run: (
      command: ChildProcess.Command
    ) => Effect.Effect<
      number,
      PlatformError.PlatformError,
      ChildProcessSpawner.ChildProcessSpawner
    >;
    readonly capture: (
      command: ChildProcess.Command
    ) => Effect.Effect<
      CommandResult,
      PlatformError.PlatformError,
      ChildProcessSpawner.ChildProcessSpawner
    >;
  }
>()('services/CommandRunner') {
  static readonly Default: Layer.Layer<CommandRunner> = Layer.succeed(CommandRunner, {
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
  });
}
