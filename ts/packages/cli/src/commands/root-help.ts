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

// ── Subcommand help definitions ────────────────────────────────────────

type SubcommandHelp = {
  usage: string;
  description: string;
  args?: ReadonlyArray<{ name: string; description: string }>;
  options?: ReadonlyArray<{ name: string; description: string }>;
  flags?: ReadonlyArray<{ name: string; description: string }>;
  examples?: ReadonlyArray<string>;
  seeAlso?: ReadonlyArray<string>;
};

const SUBCOMMAND_HELP: Record<string, SubcommandHelp> = {
  search: {
    usage: 'composio search <query> [--toolkits text] [--limit integer]',
    description:
      'Find tools by use case. Returns matching tools with slugs you can pass directly to execute.',
    args: [
      {
        name: '<query>',
        description: 'Semantic use-case query (e.g. "send an email", "create github issue")',
      },
    ],
    options: [
      { name: '--toolkits <text>', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--limit <integer>', description: 'Number of results per page (1-1000)' },
    ],
    examples: [
      'composio search "send an email"',
      'composio search "create issue" --toolkits github',
      'composio search "list calendar events" --limit 5',
    ],
    seeAlso: [
      "composio execute <slug> -d '{ ... }'    Run a tool from the results",
      "composio tools info <slug>               Inspect a tool's schema",
      'composio link <toolkit>                  Connect an account if execute tells you to',
    ],
  },
  execute: {
    usage: 'composio execute <slug> [-d, --data text] [--dry-run] [--get-schema]',
    description:
      'Execute a tool by slug. Validates inputs against cached schemas and checks connections automatically — just try it and it will tell you what to fix.',
    args: [{ name: '<slug>', description: 'Tool slug (e.g. "GITHUB_CREATE_ISSUE")' }],
    options: [
      {
        name: '-d, --data <text>',
        description:
          'JSON or JS-style object arguments, e.g. -d \'{ repo: "foo" }\', @file, or - for stdin',
      },
      {
        name: '--get-schema',
        description: 'Fetch and print the raw tool schema without executing',
      },
      {
        name: '--dry-run',
        description: 'Validate and preview the tool call without executing',
      },
    ],
    flags: [
      { name: '--skip-connection-check', description: 'Skip the linked-account check' },
      {
        name: '--skip-tool-params-check',
        description: 'Skip input validation against cached schema',
      },
      { name: '--no-verify', description: 'Skip both checks above' },
    ],
    examples: [
      `composio execute GMAIL_SEND_EMAIL -d '{ recipient_email: "a@b.com", body: "Hello" }'`,
      `composio execute GMAIL_SEND_EMAIL --dry-run -d '{ ... }'`,
      'composio execute GMAIL_SEND_EMAIL --get-schema',
    ],
    seeAlso: [
      'composio search "<query>"               Find tool slugs by use case',
      'composio tools info <slug>              Schema summary with jq hints',
      'composio link <toolkit>                 Connect an account for a toolkit',
    ],
  },
  link: {
    usage: 'composio link [<toolkit>] [--no-browser] [--no-wait]',
    description:
      'Connect an external account (GitHub, Gmail, Slack, etc.) so tools can act on your behalf. Opens a browser for OAuth authorization and waits for confirmation.',
    args: [{ name: '<toolkit>', description: 'Toolkit slug to link (e.g. "github", "gmail")' }],
    flags: [
      { name: '--no-browser', description: 'Print the auth URL instead of opening a browser' },
      {
        name: '--no-wait',
        description: 'Print link info and exit without waiting for authorization',
      },
    ],
    examples: ['composio link github', 'composio link gmail --no-browser'],
    seeAlso: [
      'composio search "<query>"               Find tools to use after linking',
      "composio execute <slug> -d '{ ... }'    Execute a tool with your linked account",
    ],
  },
  run: {
    usage: 'composio run <code> [-- ...args] | run -f <file> [-- ...args]',
    description:
      'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.',
    args: [{ name: '<code>', description: 'Inline Bun ESNext code to evaluate' }],
    options: [
      { name: '-f, --file <text>', description: 'Run a TS/JS file instead of inline code' },
      { name: '--dry-run', description: 'Preview execute() calls without running them' },
    ],
    flags: [
      { name: '--skip-connection-check', description: 'Skip the linked-account check' },
      {
        name: '--skip-tool-params-check',
        description: 'Skip input validation against cached schema',
      },
      { name: '--no-verify', description: 'Skip both checks above' },
    ],
    examples: [
      `composio run 'const issue = await execute("GITHUB_CREATE_ISSUE", { owner: "acme", repo: "app", title: "Bug" }); console.log(issue)'`,
      `composio run --dry-run 'await execute("GMAIL_SEND_EMAIL", { recipient_email: "a@b.com", body: "Hello" })'`,
      'composio run --file ./script.ts -- hello world',
    ],
    seeAlso: [
      'composio search "<query>"               Discover tool slugs before scripting',
      'composio link <toolkit>                  Connect accounts before scripting',
      'composio execute <slug> --get-schema     Inspect tool inputs before scripting',
    ],
  },
  proxy: {
    usage: 'composio proxy <url> --toolkit <text> [-X method] [-H header]... [-d data]',
    description:
      'curl-like access to any toolkit API through Composio using your linked account. Composio handles authentication — just provide the full URL and toolkit.',
    args: [{ name: '<url>', description: 'Full API endpoint URL' }],
    options: [
      {
        name: '-t, --toolkit <text>',
        description: 'Toolkit slug whose connected account should be used',
      },
      { name: '-X, --method <text>', description: 'HTTP method (GET, POST, PUT, DELETE, PATCH)' },
      {
        name: '-H, --header <text>',
        description: 'Header in "Name: value" format. Repeat for multiple.',
      },
      {
        name: '-d, --data <text>',
        description: 'Request body as raw text, JSON, @file, or - for stdin',
      },
    ],
    flags: [{ name: '--skip-connection-check', description: 'Skip the linked-account check' }],
    examples: [
      'composio proxy https://gmail.googleapis.com/gmail/v1/users/me/profile --toolkit gmail',
      `composio proxy https://gmail.googleapis.com/gmail/v1/users/me/drafts --toolkit gmail \\`,
      `  -X POST -H 'content-type: application/json' -d '{"message":{"raw":"..."}}'`,
    ],
    seeAlso: [
      'composio link <toolkit>                              Connect an account first',
      `composio run 'const f = await proxy("gmail"); ...'   Use proxy in a script`,
    ],
  },
};

function renderSubcommandHelp(cmd: SubcommandHelp): string {
  const lines: string[] = [
    '',
    bold('USAGE'),
    `  ${cmd.usage}`,
    '',
    bold('DESCRIPTION'),
    `  ${cmd.description}`,
    '',
  ];

  if (cmd.args && cmd.args.length > 0) {
    lines.push(bold('ARGUMENTS'));
    for (const arg of cmd.args) {
      lines.push(`  ${dim(arg.name.padEnd(24))}${arg.description}`);
    }
    lines.push('');
  }

  if (cmd.options && cmd.options.length > 0) {
    lines.push(bold('OPTIONS'));
    for (const opt of cmd.options) {
      lines.push(`  ${dim(opt.name.padEnd(24))}${opt.description}`);
    }
    lines.push('');
  }

  if (cmd.flags && cmd.flags.length > 0) {
    lines.push(bold('FLAGS'));
    for (const flag of cmd.flags) {
      lines.push(`  ${dim(flag.name.padEnd(28))}${flag.description}`);
    }
    lines.push('');
  }

  if (cmd.examples && cmd.examples.length > 0) {
    lines.push(bold('EXAMPLES'));
    for (const ex of cmd.examples) {
      lines.push(`  ${ex}`);
    }
    lines.push('');
  }

  if (cmd.seeAlso && cmd.seeAlso.length > 0) {
    lines.push(bold('SEE ALSO'));
    for (const sa of cmd.seeAlso) {
      lines.push(`  ${sa}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if argv is `composio <subcommand> --help` for a command we have custom help for.
 * Returns the command name if matched, undefined otherwise.
 */
export function matchSubcommandHelp(argv: ReadonlyArray<string>): string | undefined {
  const args = argv.slice(2);
  if (
    args.length === 2 &&
    (args[1] === '--help' || args[1] === '-h') &&
    args[0] in SUBCOMMAND_HELP
  ) {
    return args[0];
  }
  return undefined;
}

export function printSubcommandHelp(cmd: string): Effect.Effect<void> {
  const help = SUBCOMMAND_HELP[cmd];
  if (!help) return Console.log(`Unknown command: ${cmd}`);
  return Console.log(renderSubcommandHelp(help));
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
