import { Console, Effect } from 'effect';
import { bold } from 'src/ui/colors';

type BasicCommand = {
  name: string;
  description: string;
  usage: string;
  options?: ReadonlyArray<{ name: string; description: string }>;
};

const BASIC_COMMANDS: ReadonlyArray<BasicCommand> = [
  {
    name: 'version',
    description: 'Display the current Composio CLI version.',
    usage: 'version',
  },
  {
    name: 'upgrade',
    description: 'Upgrade your Composio CLI to the latest available version.',
    usage: 'upgrade',
  },
  {
    name: 'whoami',
    description: 'Display your account information.',
    usage: 'whoami',
  },
  {
    name: 'login',
    description: 'Log in to the Composio CLI session.',
    usage: 'login [--no-browser] [--no-wait] [--key text] [-y, --yes]',
    options: [
      { name: '--no-browser', description: 'Login without browser interaction' },
      {
        name: '--no-wait',
        description: 'Print login URL and session info, then exit (no browser, no waiting)',
      },
      {
        name: '--key',
        description: 'Complete login using session key from --no-wait',
      },
      { name: '-y, --yes', description: 'Skip org picker; use session default org' },
    ],
  },
  {
    name: 'logout',
    description: 'Log out from the Composio CLI session.',
    usage: 'logout',
  },
  {
    name: 'init',
    description: 'Initialize this directory with a developer project.',
    usage: 'init [--no-browser] [-y, --yes]',
    options: [
      { name: '--no-browser', description: 'Skip opening browser for auth' },
      { name: '-y, --yes', description: 'Auto-select the default developer project' },
    ],
  },
  {
    name: 'search',
    description: 'Search tools by use case across toolkits/apps.',
    usage: 'search <query> [--toolkits text] [--limit integer]',
    options: [
      { name: '<query>', description: 'Semantic use-case query (e.g. "send emails")' },
      { name: '--toolkits', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--limit', description: 'Number of results per page (1-1000)' },
    ],
  },
  {
    name: 'execute',
    description: 'Execute a tool.',
    usage: 'execute <slug> [-d, --data text]',
    options: [
      { name: '<slug>', description: 'Tool slug (e.g. "GITHUB_CREATE_ISSUE")' },
      { name: '-d, --data', description: 'JSON arguments, @file, or - for stdin' },
    ],
  },
  {
    name: 'link',
    description: 'Connect a user account for a toolkit/app.',
    usage: 'link [<toolkit>] [--no-browser]',
    options: [
      { name: '<toolkit>', description: 'Toolkit slug to link (e.g. "github", "gmail")' },
      { name: '--no-browser', description: 'Skip auto-opening the browser' },
    ],
  },
  {
    name: 'listen',
    description: 'Listen for trigger events.',
    usage:
      'listen [--toolkits text] [--trigger-id text] [--user-id text] [--max-events integer] [--forward text] [--out text]',
    options: [
      { name: '--toolkits', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--trigger-id', description: 'Filter by trigger id' },
      { name: '--user-id', description: 'Filter by user id' },
      { name: '--max-events', description: 'Stop after N matching events' },
      {
        name: '--forward',
        description: 'Forward events to URL (signed with COMPOSIO_WEBHOOK_SECRET)',
      },
      { name: '--out', description: 'Append events to file' },
      { name: '--json', description: 'Show raw event payload as JSON' },
      { name: '--table', description: 'Show compact table rows' },
    ],
  },
];

const ADVANCED_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  {
    name: 'generate',
    description:
      'Generate type stubs for toolkits, tools, and triggers, auto-detecting project language (TypeScript | Python)',
  },
  {
    name: 'manage',
    description:
      'Developer/admin workflows: orgs, toolkits, triggers, auth configs, logs, and deprecated project commands.',
  },
];

/**
 * Prints the root-level help output in gh-style format.
 * Shows only top-level commands, not nested subcommands.
 * Basic commands include full usage and options.
 */
export function printRootHelp(): Effect.Effect<void> {
  const name = 'composio';
  const allCommands = [
    ...BASIC_COMMANDS.map(c => ({ name: c.name, description: c.description })),
    ...ADVANCED_COMMANDS,
  ];
  const maxNameLen = Math.max(...allCommands.map(c => c.name.length), 10);

  const basicLines: string[] = [];
  for (const cmd of BASIC_COMMANDS) {
    basicLines.push(`  ${cmd.name}`);
    basicLines.push(`    ${cmd.description}`);
    basicLines.push(`    Usage: ${name} ${cmd.usage}`);
    if (cmd.options && cmd.options.length > 0) {
      basicLines.push('    Options:');
      for (const opt of cmd.options) {
        basicLines.push(`      ${opt.name.padEnd(20)}  ${opt.description}`);
      }
    }
    basicLines.push('');
  }

  const lines: string[] = [
    '',
    'Connect AI agents to external tools. `search`, `link`, and `execute` use your org consumer project by default. `init`, `listen`, and `manage` use developer project context.',
    '',
    bold('USAGE'),
    `  ${name} <command> [options]`,
    '',
    bold('BASIC COMMANDS'),
    ...basicLines,
    bold('ADVANCED COMMANDS'),
    ...ADVANCED_COMMANDS.map(cmd => `  ${cmd.name.padEnd(maxNameLen)}  ${cmd.description}`),
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
