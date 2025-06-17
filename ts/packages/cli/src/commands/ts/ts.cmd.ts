import { Command } from '@effect/cli';
import { tsCmd$Generate } from './commands/ts.generate.cmd';

/**
 * CLI entry point for TypeScript commands.
 *
 * @example
 * ```bash
 * composio ts <command>
 * ```
 */
export const tsCmd = Command.make('ts').pipe(
  Command.withDescription('Handle TypeScript projects.'),
  Command.withSubcommands([tsCmd$Generate])
);
