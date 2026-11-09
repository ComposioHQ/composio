import { Help, Version } from 'src/commands/root-help';
import type { CliConfig } from 'effect/cli';

// Help and version use the framework parser, wrapped to record the command they answer for. The
// help formatter keeps version output bare.
export const ComposioCliConfig = {
  builtIns: [Help, Version],
} satisfies Partial<CliConfig.CliConfig.Service>;
