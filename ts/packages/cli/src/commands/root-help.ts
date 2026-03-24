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
    name: 'run',
    description: 'Run inline ESNext TS/JS code or a file with Bun and injected Composio helpers.',
    usage:
      'run <code> [-- ...args] | run [-f, --file text] [-- ...args] [--dry-run] [--skip-connection-check] [--skip-tool-params-check] [--no-verify]',
    options: [
      {
        name: '<code>',
        description:
          'Inline Bun ESNext code with injected execute(slug, data?) and search(query, options?) helpers',
      },
      {
        name: '-f, --file',
        description: 'Run a TS/JS file with the Bun runtime instead of inline code',
      },
      {
        name: '--dry-run',
        description: 'Preview execute(...) calls without running remote actions',
      },
      {
        name: '--skip-connection-check',
        description:
          'Skip the short-lived linked-account fail-fast check if you just connected an account',
      },
      {
        name: '--skip-tool-params-check',
        description: 'Skip the local tool parameter/schema validation check',
      },
      {
        name: '--no-verify',
        description:
          'Skip both the linked-account fail-fast check and the local tool parameter check',
      },
    ],
  },
  {
    name: 'search',
    description: 'Semantic search for tools by use case across all toolkits/apps.',
    usage: 'search <query> [--toolkits text] [--limit integer]',
    options: [
      { name: '<query>', description: 'Semantic use-case query (e.g. "send emails")' },
      { name: '--toolkits', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--limit', description: 'Number of results per page (1-1000)' },
    ],
  },
  {
    name: 'tools',
    description: 'List tools for one toolkit, or inspect a cached schema-backed summary.',
    usage: 'tools list <toolkit> [--query text] | tools info <slug>',
    options: [
      {
        name: 'list <toolkit>',
        description: 'Non-semantic per-toolkit listing; use this when you already know the toolkit',
      },
      {
        name: 'info <slug>',
        description:
          'Print a brief summary and cache the same raw schema used by execute --get-schema',
      },
    ],
  },
  {
    name: 'execute',
    description: 'Execute a tool, preview it with --dry-run, or fetch its input schema.',
    usage:
      'execute <slug> [-d, --data text] [--dry-run] [--get-schema] [--skip-connection-check] [--skip-tool-params-check] [--no-verify]',
    options: [
      { name: '<slug>', description: 'Tool slug (e.g. "GITHUB_CREATE_ISSUE")' },
      {
        name: '-d, --data',
        description:
          'JSON or JS-style object arguments, e.g. -d \'{ repo: "foo" }\', @file, or - for stdin',
      },
      { name: '--dry-run', description: 'Validate and preview the tool call without executing it' },
      {
        name: '--get-schema',
        description:
          'Fetch and print the raw cached schema; tools info shows the same schema with a brief summary',
      },
      {
        name: '--skip-connection-check',
        description:
          'Skip the short-lived linked-account fail-fast check if you just connected an account',
      },
      {
        name: '--skip-tool-params-check',
        description: 'Skip the local tool parameter/schema validation check',
      },
      {
        name: '--no-verify',
        description:
          'Skip both the linked-account fail-fast check and the local tool parameter check',
      },
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
];

const ADVANCED_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  {
    name: 'dev',
    description:
      'Developer workflows: init a local project, execute tools with playground users, listen for triggers, and inspect logs.',
  },
  {
    name: 'generate',
    description:
      'Generate type stubs for toolkits, tools, and triggers, auto-detecting project language (TypeScript | Python)',
  },
  {
    name: 'manage',
    description:
      'Manage your developer orgs, toolkits, connected accounts, triggers, auth configs, and projects.',
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
    'Connect AI agents to external tools. `search`, `link`, `execute`, and `run` let you take actions across 1000+ apps directly; if you can describe it, it is probably supported.',
    "Try `execute` sooner than you'd think. It parses inputs, validates them against cached schemas when available, and will usually tell you whether you need to fix arguments, inspect schema, or `link` an account.",
    'Use `dev` when you are building with Composio and want scaffolding, playground execution, triggers, and logs.',
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
