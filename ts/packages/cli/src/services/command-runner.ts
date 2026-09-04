import { Command } from '@effect/platform';
import { Effect, Stream, String } from 'effect';

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Drains a child-process output stream into one string; shared with the run-helpers runtime. */
export const collectText = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(Stream.decodeText(), Stream.runFold(String.empty, String.concat));

export class CommandRunner extends Effect.Service<CommandRunner>()('services/CommandRunner', {
  sync: () => ({
    run: (command: Command.Command) => Command.exitCode(command),
    capture: (command: Command.Command) =>
      Effect.scoped(
        Effect.gen(function* () {
          const childProcess = yield* Command.start(command);
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
  }),
  dependencies: [],
}) {}
