import { Command } from '@effect/cli';
import { logsCmd$Tools } from './commands/logs.tools.cmd';
import { logsCmd$Triggers } from './commands/logs.triggers.cmd';

/**
 * CLI entry point for logs commands.
 *
 * @example
 * ```bash
 * composio dev logs <command>
 * ```
 */
export const logsCmd = Command.make('logs').pipe(
  Command.withDescription('Inspect trigger and tool execution logs.'),
  Command.withSubcommands([logsCmd$Triggers, logsCmd$Tools])
);
