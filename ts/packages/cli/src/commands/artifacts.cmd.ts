import process from 'node:process';
import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { resolveCliSessionArtifacts } from 'src/services/cli-session-artifacts';

const cwdCmd = Command.make('cwd').pipe(
  Command.withDescription('Print the cwd-scoped session artifact directory.'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const artifacts = yield* resolveCliSessionArtifacts();
      const directoryPath = Option.match(artifacts, {
        onNone: () => '/tmp/composio',
        onSome: value => value.directoryPath,
      });
      process.stdout.write(`${directoryPath}\n`);
    })
  )
);

export const artifactsCmd = Command.make('artifacts').pipe(
  Command.withDescription('Inspect session artifact directories.'),
  Command.withSubcommands([cwdCmd])
);
