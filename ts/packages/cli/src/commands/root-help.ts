import { Console, Effect } from 'effect';
import { bold } from 'src/ui/colors';

/**
 * Top-level commands for the root help output.
 * Order and descriptions must match the commands in index.ts.
 */
const ROOT_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'version', description: 'Display the current Composio CLI version.' },
  { name: 'upgrade', description: 'Upgrade your Composio CLI to the latest available version.' },
  { name: 'whoami', description: 'Display your account information.' },
  { name: 'login', description: 'Log in to the Composio CLI session.' },
  { name: 'logout', description: 'Log out from the Composio CLI session.' },
  { name: 'init', description: 'Initialize a Composio project in the current directory.' },
  {
    name: 'generate',
    description:
      'Generate type stubs for toolkits, tools, and triggers, auto-detecting project language (TypeScript | Python)',
  },
  { name: 'py', description: 'Handle Python projects.' },
  { name: 'ts', description: 'Handle TypeScript projects.' },
  { name: 'toolkits', description: 'Discover and inspect Composio toolkits.' },
  { name: 'tools', description: 'Discover and inspect Composio tools.' },
  { name: 'auth-configs', description: 'View and manage Composio auth configs.' },
  { name: 'connected-accounts', description: 'View and manage Composio connected accounts.' },
  { name: 'triggers', description: 'Inspect and subscribe to trigger events.' },
  { name: 'logs', description: 'Inspect trigger and tool execution logs.' },
  { name: 'orgs', description: 'Manage default global organization/project context.' },
  { name: 'projects', description: 'Manage default global project context.' },
];

/**
 * Prints the root-level help output in gh-style format.
 * Shows only top-level commands, not nested subcommands.
 */
export function printRootHelp(): Effect.Effect<void> {
  const name = 'composio';
  const maxNameLen = Math.max(...ROOT_COMMANDS.map(c => c.name.length), 10);

  const lines: string[] = [
    '',
    'Connect AI agents to external tools. Link accounts, discover tools, and execute them.',
    '',
    bold('USAGE'),
    `  ${name} <command> [options]`,
    '',
    bold('COMMANDS'),
    ...ROOT_COMMANDS.map(cmd => `  ${cmd.name.padEnd(maxNameLen)}  ${cmd.description}`),
    '',
    bold('FLAGS'),
    `  -h, --help     Show help for command`,
    `  --version      Show ${name} version`,
    '',
    bold('LEARN MORE'),
    `  Use \`${name} <command> --help\` for more information about a command.`,
    `  Documentation: https://docs.composio.dev`,
    '',
  ];

  return Console.log(lines.join('\n'));
}
