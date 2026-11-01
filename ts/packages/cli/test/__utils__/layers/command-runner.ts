import { Effect, Layer } from 'effect';
import { CommandRunner, type CommandRunnerShape } from 'src/services/command-runner';

/**
 * A runner that never spawns: every command exits 0 with empty output.
 */
const exitZeroCommandRunner = CommandRunner.of({
  run: () => Effect.succeed(0),
  capture: () =>
    Effect.succeed({
      exitCode: 0,
      stdout: '',
      stderr: '',
    }),
});

/**
 * A `CommandRunner` that answers with `runner`, or exits 0 with empty output
 * when the test leaves it out. It never spawns a process, but its methods
 * still require the `ChildProcessSpawner` their shape names.
 */
export const CommandRunnerTest = (runner?: CommandRunnerShape) =>
  Layer.succeed(CommandRunner, runner ?? exitZeroCommandRunner);
