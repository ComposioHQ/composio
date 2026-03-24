import { Console, Effect } from 'effect';
import { bold, dim, gray } from 'src/ui/colors';

type DetailedCommand = {
  name: string;
  description: string;
  usage: string;
  options?: ReadonlyArray<{ name: string; description: string }>;
};

type CompactCommand = {
  name: string;
  description: string;
};

// ── Core workflow commands ──────────────────────────────────────────────

const CORE_COMMANDS: ReadonlyArray<DetailedCommand> = [
  {
    name: 'search',
    description: 'Find tools by use case across all toolkits/apps.',
    usage: 'search <query> [--toolkits text] [--limit integer]',
    options: [
      { name: '<query>', description: 'Semantic use-case query (e.g. "send emails")' },
      { name: '--toolkits', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--limit', description: 'Number of results per page (1-1000)' },
    ],
  },
  {
    name: 'execute',
    description:
      'Execute a tool. Validates inputs and connections automatically; use it aggressively.',
    usage: 'execute <slug> [-d, --data text] [--dry-run] [--get-schema]',
    options: [
      { name: '<slug>', description: 'Tool slug (e.g. "GITHUB_CREATE_ISSUE")' },
      {
        name: '-d, --data',
        description:
          'JSON or JS-style object arguments, e.g. -d \'{ repo: "foo" }\', @file, or - for stdin',
      },
      { name: '--dry-run', description: 'Validate and preview the tool call without executing it' },
      { name: '--get-schema', description: 'Fetch and print the raw tool schema' },
    ],
  },
  {
    name: 'link',
    description: 'Connect your account for a toolkit/app.',
    usage: 'link [<toolkit>] [--no-browser]',
    options: [{ name: '<toolkit>', description: 'Toolkit slug to link (e.g. "github", "gmail")' }],
  },
  {
    name: 'run',
    description:
      'Run inline TS/JS code with shimmed CLI commands; injected execute(), proxy(), and search() behave like their CLI counterparts.',
    usage: 'run <code> [-- ...args] | run [-f, --file text] [-- ...args] [--dry-run]',
    options: [
      { name: '<code>', description: 'Inline Bun ESNext code to evaluate' },
      { name: '-f, --file', description: 'Run a TS/JS file instead of inline code' },
      { name: '--dry-run', description: 'Preview execute() calls without running remote actions' },
    ],
  },
  {
    name: 'proxy',
    description: 'curl-like access to any toolkit API through Composio using your linked account.',
    usage: 'proxy <url> --toolkit text [-X method] [-H header]... [-d data]',
    options: [
      { name: '<url>', description: 'Full API endpoint URL' },
      { name: '--toolkit', description: 'Toolkit slug whose connected account should be used' },
      { name: '-X, --method', description: 'HTTP method (GET, POST, PUT, DELETE, PATCH)' },
      { name: '-H, --header', description: 'Header in "Name: value" format. Repeat for multiple.' },
      { name: '-d, --data', description: 'Request body as raw text, JSON, @file, or - for stdin' },
    ],
  },
];

// ── Developer commands ─────────────────────────────────────────────────

const OTHER_COMMANDS: ReadonlyArray<CompactCommand> = [
  { name: 'tools info <slug>', description: 'Print tool summary and cache its schema' },
  { name: 'tools list <toolkit>', description: 'List tools available in a toolkit' },
];

const DEVELOPER_COMMANDS: ReadonlyArray<CompactCommand> = [
  {
    name: 'dev',
    description: 'Developer workflows: init, playground execution, triggers, and logs.',
  },
  {
    name: 'generate',
    description: 'Generate type stubs for toolkits, tools, and triggers (TypeScript | Python).',
  },
  {
    name: 'manage',
    description: 'Manage orgs, toolkits, connected accounts, triggers, auth configs, and projects.',
  },
];

// ── Account commands ───────────────────────────────────────────────────

const ACCOUNT_COMMANDS: ReadonlyArray<CompactCommand> = [
  { name: 'login', description: 'Log in to Composio' },
  { name: 'logout', description: 'Log out from Composio' },
  { name: 'whoami', description: 'Show current account info' },
  { name: 'version', description: 'Display CLI version' },
  { name: 'upgrade', description: 'Upgrade CLI to the latest version' },
];

// ── Render helpers ─────────────────────────────────────────────────────

function renderDetailedCommands(name: string, commands: ReadonlyArray<DetailedCommand>): string[] {
  const lines: string[] = [];
  for (const cmd of commands) {
    lines.push(`  ${bold(cmd.name)}`);
    lines.push(`    ${cmd.description}`);
    lines.push(`    ${dim('Usage:')} ${name} ${cmd.usage}`);
    if (cmd.options && cmd.options.length > 0) {
      for (const opt of cmd.options) {
        lines.push(`      ${dim(opt.name.padEnd(20))}${opt.description}`);
      }
    }
    lines.push('');
  }
  return lines;
}

function renderCompactCommands(commands: ReadonlyArray<CompactCommand>): string[] {
  const maxLen = Math.max(...commands.map(c => c.name.length));
  return commands.map(cmd => `  ${cmd.name.padEnd(maxLen + 2)}${cmd.description}`);
}

// ── Main help output ───────────────────────────────────────────────────

/**
 * Prints the root-level help output.
 * Core workflow commands are shown first with full usage/options.
 * Housekeeping and developer commands are shown compactly at the bottom.
 */
export function printRootHelp(): Effect.Effect<void> {
  const name = 'composio';

  const lines: string[] = [
    '',
    `Connect AI agents to external tools. ${bold('search')}, ${bold('execute')}, ${bold('link')}, ${bold('proxy')}, and ${bold('run')} let you`,
    'take actions across 1000+ apps directly; if you can describe it, it is probably supported.',
    `Try ${bold('execute')} sooner than you'd think — it validates inputs, checks connections, and tells`,
    'you what to fix.',
    '',
    `Use ${bold('dev')} when you are building an agent with Composio's SDK and want scaffolding,`,
    'playground execution, triggers, and logs.',
    '',
    bold('USAGE'),
    `  ${name} <command> [options]`,
    '',
    bold('CORE COMMANDS'),
    ...renderDetailedCommands(name, CORE_COMMANDS),
    gray('  Typical flow: search → execute (link and tools when needed)'),
    '',
    bold('TOOLS'),
    ...renderCompactCommands(OTHER_COMMANDS),
    '',
    bold('EXAMPLES'),
    `  ${dim('# Find a tool')}`,
    `  ${name} search "create github issue"`,
    '',
    `  ${dim('# Connect your GitHub account')}`,
    `  ${name} link github`,
    '',
    `  ${dim('# Execute a tool')}`,
    `  ${name} execute GITHUB_CREATE_ISSUE -d '{ repo: "owner/repo", title: "Bug" }'`,
    '',
    `  ${dim('# Call an API directly through proxy')}`,
    `  ${name} proxy https://gmail.googleapis.com/gmail/v1/users/me/profile --toolkit gmail`,
    '',
    `  ${dim('# Run a script with injected helpers')}`,
    `  ${name} run 'const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER"); console.log(me)'`,
    '',
    bold('DEVELOPER COMMANDS'),
    ...renderCompactCommands(DEVELOPER_COMMANDS),
    '',
    bold('ACCOUNT'),
    ...renderCompactCommands(ACCOUNT_COMMANDS),
    '',
    bold('FLAGS'),
    '  -h, --help     Show help for command',
    `  --version      Show ${name} version`,
    '',
    bold('LEARN MORE'),
    `  Use \`${name} <command> --help\` for more information about a command.`,
    `  Documentation: https://docs.composio.dev`,
    '',
  ];

  return Console.log(lines.join('\n'));
}
