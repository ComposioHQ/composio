import { Effect } from 'effect';
import { Command, Completions } from 'effect/unstable/cli';

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
 * Converts a public `Command.Command` tree into the `Completions.CommandDescriptor`
 * shape consumed by `effect/unstable/cli`'s completion-script generator.
 *
 * v4 has no like-for-like replacement for v3's rich `CommandDescriptor` walk:
 * `Command.Command` only exposes `name` / `description` / `subcommands`
 * publicly (see `effect/unstable/cli/Command`), not per-flag or per-argument
 * metadata. Completions are therefore generated at the subcommand-name level
 * only; flag/argument value completion is intentionally omitted until
 * `effect/unstable/cli` exposes that metadata through a public API.
 */
const toCompletionDescriptor = (command: Command.Command.Any): Completions.CommandDescriptor => ({
  name: command.name,
  description: command.description,
  flags: [],
  arguments: [],
  subcommands: command.subcommands.flatMap(group => group.commands.map(toCompletionDescriptor)),
});

/**
 * Generate a shell completion script for the given command tree and shell type.
 */
export const getCompletionScript = (
  command: Command.Command.Any,
  shell: Shell
): Effect.Effect<Array<string>> => {
  const script = Completions.generate('composio', shell, toCompletionDescriptor(command));
  const lines = script.split('\n');
  return Effect.succeed(shell === 'fish' ? sanitizeFishCompletionLines(lines) : lines);
};

export const _test = {
  sanitizeFishCompletionLine,
};
