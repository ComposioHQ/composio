import { Command } from '@effect/cli';
import { Effect } from 'effect';

type Shell = 'bash' | 'zsh' | 'fish';

const sanitizeFishDescription = (description: string): string =>
  description
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const sanitizeFishCompletionLine = (line: string): string => {
  const normalized = line.replace(/\s*\n\s*/g, ' ');
  const descriptionMarker = " -d '";
  const descriptionIndex = normalized.indexOf(descriptionMarker);

  if (descriptionIndex === -1 || !normalized.endsWith("'")) {
    return normalized;
  }

  const prefix = normalized.slice(0, descriptionIndex);
  const description = normalized.slice(descriptionIndex + descriptionMarker.length, -1);

  return `${prefix} -d "${sanitizeFishDescription(description)}"`;
};

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
        Effect.map(lines => lines.map(sanitizeFishCompletionLine))
      );
  }
};
