import * as Command from '@effect/platform/Command';
import { Effect, Stream, String, Context, Layer } from 'effect';

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Drains a child-process output stream into one string; shared with the run-helpers runtime. */
export const collectText = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(Stream.decodeText(), Stream.runFold(String.empty, String.concat));

const makeCommandRunner = Effect.sync(() => ({
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
}));

export type CommandRunnerShape = Effect.Effect.Success<typeof makeCommandRunner>;

export class CommandRunner extends Context.Tag('services/CommandRunner')<
  CommandRunner,
  CommandRunnerShape
>() {
  static readonly Default = Layer.effect(CommandRunner, makeCommandRunner);
}
