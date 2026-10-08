import { Help } from 'src/commands/root-help';
import { GlobalFlag, type CliConfig } from 'effect/unstable/cli';

// Help and version use the framework parser. The help formatter keeps version output bare.
export const ComposioCliConfig = {
  builtIns: [Help, GlobalFlag.Version],
} satisfies Partial<CliConfig.CliConfig.Service>;
