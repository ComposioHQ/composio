import { Command } from 'effect/cli';
import { requireLogin } from 'src/effects/require-auth';
import { logsCmd$Tools } from './tools/logs.tools.cmd';
import { logsCmd$Triggers } from './triggers/logs.triggers.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

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
  withRegisteredSubcommands([logsCmd$Triggers, logsCmd$Tools]),
  requireLogin
);
