import { Command } from 'effect/cli';
import { runArtifactsCwd } from './artifacts.cwd.handler';

export const artifactsCmd$Cwd = Command.make('cwd', {}, runArtifactsCwd).pipe(
  Command.withDescription('Print the cwd-scoped session artifact directory.')
);
