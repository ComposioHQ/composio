import { Command } from 'effect/cli';
import { requireLogin } from 'src/effects/require-auth';
import { logsCmd$Tools } from './commands/logs.tools.cmd';
import { logsCmd$Triggers } from './triggers/logs.triggers.cmd';

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
  Command.withSubcommands([logsCmd$Triggers, logsCmd$Tools]),
  requireLogin
);
