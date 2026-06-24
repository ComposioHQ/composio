import { Command } from '@effect/cli';
import { Effect } from 'effect';

type Shell = 'bash' | 'zsh' | 'fish';

const sanitizeFishCompletionLine = (line: string): string => {
  if (!line.startsWith('complete ')) {
    return line;
  }

  const descriptionIndex = line.indexOf(' -d ');
  if (descriptionIndex === -1) {
    return line;
  }

  // Fish descriptions are optional. Dropping them avoids parse errors from
  // multiline or quote-heavy command descriptions emitted by the upstream generator.
  return line.slice(0, descriptionIndex).trimEnd();
};

const sanitizeFishCompletionLines = (lines: Array<string>): Array<string> =>
  lines.map(sanitizeFishCompletionLine);

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
      return Command.getFishCompletions(command, 'composio').pipe(
        Effect.map(sanitizeFishCompletionLines)
      );
  }
};

export const _test = {
  sanitizeFishCompletionLine,
};
