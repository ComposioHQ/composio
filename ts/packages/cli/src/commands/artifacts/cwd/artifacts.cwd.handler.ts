import { Effect, Option } from 'effect';
import {
  resolveArtifactsRoot,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * Prints the artifact directory of the CLI session bound to the current directory, or the
 * artifacts root when no session is bound. The path is data, so it is written even when stdout
 * is a terminal.
 */
export const runArtifactsCwd = () =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const artifacts = yield* resolveCliSessionArtifacts();
    const directoryPath = yield* Option.match(artifacts, {
      onSome: ({ directoryPath }) => Effect.succeed(directoryPath),
      onNone: () => resolveArtifactsRoot,
    });
    yield* ui.output(directoryPath, { force: true });
  });
