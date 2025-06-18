import type { CliConfig } from '@effect/cli/CliConfig';

export const ComposioCliConfig = {
  showBuiltIns: false,
  autoCorrectLimit: 0,
  isCaseSensitive: true,
} satisfies Partial<CliConfig>;
