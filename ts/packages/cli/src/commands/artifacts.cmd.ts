import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import {
  resolveArtifactsRoot,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { TerminalUI } from 'src/services/terminal-ui';

const cwdCmd = Command.make('cwd').pipe(
  Command.withDescription('Print the cwd-scoped session artifact directory.'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const artifacts = yield* resolveCliSessionArtifacts();
      const directoryPath = Option.isSome(artifacts)
        ? artifacts.value.directoryPath
        : yield* resolveArtifactsRoot;
      yield* ui.output(directoryPath, { force: true });
    })
  )
);

export const artifactsCmd = Command.make('artifacts').pipe(
  Command.withDescription('Inspect session artifact directories.'),
  Command.withSubcommands([cwdCmd])
);
