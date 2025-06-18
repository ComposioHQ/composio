import { Command } from '@effect/cli';
import { pyCmd$Generate } from './commands/py.generate.cmd';

/**
 * CLI entry point for Python commands.
 *
 * @example
 * ```bash
 * composio py <command>
 * ```
 */
export const pyCmd = Command.make('py').pipe(
  Command.withDescription('Handle Python projects.'),
  Command.withSubcommands([pyCmd$Generate])
);
