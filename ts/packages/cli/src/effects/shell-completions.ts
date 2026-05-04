import { Command } from '@effect/cli';
import { Effect } from 'effect';

type Shell = 'bash' | 'zsh' | 'fish';

/**
 * Generate a shell completion script for the given command tree and shell type.
 * Uses @effect/cli's built-in completion generators.
 */
export const getCompletionScript = <Name extends string, R, E, A>(
  command: Command.Command<Name, R, E, A>,
  shell: Shell
): Effect.Effect<Array<string>> => {
  switch (shell) {
    case 'bash':
      return Command.getBashCompletions(command, 'composio');
    case 'zsh':
      return Command.getZshCompletions(command, 'composio');
    case 'fish':
      return Command.getFishCompletions(command, 'composio');
  }
};
