import { Command } from '@effect/cli';
import { Effect } from 'effect';

type Shell = 'bash' | 'zsh' | 'fish';

/**
 * Sanitize fish completion lines so they produce valid fish syntax.
 *
 * The @effect/cli generator emits `-d '...'` descriptions that may contain
 * unescaped single quotes (e.g. from example text or apostrophes), which
 * breaks fish's parser.  Fish has no in-string escape for single quotes, so
 * we replace each `'` inside a `-d '...'` value with `\'` (backslash-escape
 * outside quotes) — the standard fish idiom.
 */
const sanitizeFishCompletions = (lines: Array<string>): Array<string> =>
  lines.map(line => {
    // Match the -d '...' portion at the end of a `complete` line.
    // We need to find the -d flag and fix its single-quoted value.
    return line.replace(/-d '((?:[^'\\]|\\.)*)'/g, (_match, inner: string) => {
      // The inner content is between the quotes — escape any literal single quotes
      const escaped = inner.replace(/'/g, "\\'");
      return `-d '${escaped}'`;
    }).replace(/-d '([^']*)$/gm, (_match, rest: string) => {
      // Handle unterminated single-quoted strings (multiline descriptions that
      // @effect/cli may produce).  Truncate at the first newline-ish boundary
      // and close the quote.
      const safe = rest.replace(/'/g, "\\'");
      return `-d '${safe}'`;
    });
  });

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
        Effect.map(sanitizeFishCompletions)
      );
  }
};
