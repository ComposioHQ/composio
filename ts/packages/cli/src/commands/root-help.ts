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
    usage: 'search <query...> [--toolkits text] [--limit integer] [--human]',
    options: [
      {
        name: '<query...>',
        description: 'One or more semantic use-case queries (e.g. "send emails" "github issues")',
      },
      { name: '--toolkits', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--limit', description: 'Maximum number of results (1-1000)' },
      { name: '--human', description: 'Show formatted output instead of default JSON' },
    ],
  },
  {
    name: 'execute',
    description:
      'Execute a tool. Validates inputs and connections automatically; use it aggressively.',
    usage:
      'execute <slug> [-d, --data text] [--dry-run] [--get-schema] | execute -p <slug> -d <text> <slug> -d <text> ...',
    options: [
      { name: '<slug>', description: 'Tool slug (e.g. "GITHUB_CREATE_ISSUE")' },
      {
        name: '-d, --data',
        description:
          'JSON or JS-style object arguments, e.g. -d \'{ repo: "foo" }\', @file, or - for stdin',
      },
      {
        name: '-p, --parallel',
        description: 'Execute repeated <slug> -d <text> pairs concurrently',
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
      'Run inline TS/JS code with shimmed CLI commands; injected execute(), search(), proxy(), subAgent(), and z (zod).',
    usage: 'run <code> [-- ...args] | run [-f, --file text] [-- ...args] [--dry-run]',
    options: [
      { name: '<code>', description: 'Inline Bun ESNext code to evaluate' },
      { name: '-f, --file', description: 'Run a TS/JS file instead of inline code' },
      { name: '--dry-run', description: 'Preview execute() calls without running remote actions' },
    ],
  },
  {
    name: 'proxy',
    description:
      'curl-like access to any toolkit API through Composio using your connected account.',
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
  { name: 'composio tools info <slug>', description: 'Print tool summary and cache its schema' },
  { name: 'composio tools list <toolkit>', description: 'List tools available in a toolkit' },
  {
    name: 'composio artifacts cwd',
    description: 'Print the cwd-scoped session artifact directory',
  },
];

const DEVELOPER_COMMANDS: ReadonlyArray<CompactCommand> = [
  {
    name: 'dev',
    description:
      'Developer workflows and management: init, execute, logs, orgs, projects, toolkits, accounts, and triggers.',
  },
  {
    name: 'generate',
    description: 'Generate type stubs for toolkits, tools, and triggers (TypeScript | Python).',
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
  injectedHelpers?: ReadonlyArray<{ name: string; description: string }>;
  examples?: ReadonlyArray<string>;
  seeAlso?: ReadonlyArray<string>;
};

const SUBCOMMAND_HELP: Record<string, SubcommandHelp> = {
  search: {
    usage: 'composio search <query...> [--toolkits text] [--limit integer] [--human]',
    description:
      'Find tools by use case. Defaults to JSON output; use --human for formatted output.',
    args: [
      {
        name: '<query...>',
        description:
          'One or more semantic use-case queries (e.g. "send an email", "create github issue")',
      },
    ],
    options: [
      { name: '--toolkits <text>', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--limit <integer>', description: 'Maximum number of results (1-1000)' },
      { name: '--human', description: 'Show formatted human-readable search output' },
    ],
    examples: [
      '# Find tools for a use case',
      'composio search "send an email"',
      'composio search "send an email" "create github issue"',
      'composio search "my emails" "my github issues" --toolkits gmail,github',
      'composio search "create issue" --toolkits github',
      'composio search "send an email" --human',
      '',
      '# Cross-app workflow discovery',
      'composio search "post a message to a slack channel"',
      'composio search "add a row to google sheet"',
      '',
      '# Narrow results to a specific toolkit',
      'composio search "list calendar events" --toolkits google_calendar --limit 5',
    ],
    seeAlso: [
      "composio execute <slug> -d '{ ... }'    Run a tool from the results",
      "composio tools info <slug>               Inspect a tool's full schema",
      'composio link <toolkit>                  Connect an account if execute tells you to',
    ],
  },
  execute: {
    usage: 'composio execute <slug> [-d, --data text] [--dry-run] [--get-schema] [--parallel]',
    description:
      'Execute a tool by slug. Validates inputs against cached schemas and checks connections automatically — just try it and it will tell you what to fix.',
    args: [
      {
        name: '<slug>',
        description:
          'Tool slug for single execute, or repeated <slug> -d <text> pairs when using -p/--parallel',
      },
    ],
    options: [
      {
        name: '-d, --data <text>',
        description:
          'JSON or JS-style object arguments, e.g. -d \'{ repo: "foo" }\', @file, or - for stdin',
      },
      {
        name: '-p, --parallel',
        description: 'Execute repeated TOOL_SLUG -d <text> groups concurrently',
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
      { name: '--skip-connection-check', description: 'Skip the connected-account check' },
      {
        name: '--skip-tool-params-check',
        description: 'Skip input validation against cached schema',
      },
      { name: '--skip-checks', description: 'Skip both checks above' },
    ],
    examples: [
      '# Send an email',
      `composio execute GMAIL_SEND_EMAIL -d '{ recipient_email: "a@b.com", subject: "Hello", body: "World" }'`,
      '',
      '# Create a GitHub issue',
      `composio execute GITHUB_CREATE_ISSUE -d '{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }'`,
      '',
      '# Preview what a tool call would send without executing',
      `composio execute SLACK_SEND_A_MESSAGE_TO_A_SLACK_CHANNEL --dry-run -d '{ channel: "general", text: "Hello team" }'`,
      '',
      '# Check what inputs a tool needs',
      'composio execute GMAIL_SEND_EMAIL --get-schema',
      '',
      '# Read arguments from a file',
      'composio execute GITHUB_CREATE_ISSUE -d @issue.json',
      '',
      '# Execute multiple tools concurrently',
      `composio execute -p GMAIL_SEND_EMAIL -d '{ recipient_email: "a@b.com" }' GITHUB_CREATE_AN_ISSUE -d '{ owner: "acme", repo: "app", title: "Bug" }'`,
    ],
    seeAlso: [
      'composio search "<query>"               Find tool slugs by use case',
      'composio tools info <slug>              Schema summary with jq hints',
      'composio link <toolkit>                 Connect an account for a toolkit',
      'composio artifacts cwd                  Print the current session artifact directory',
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
      "composio execute <slug> -d '{ ... }'    Execute a tool with your connected account",
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
      { name: '--debug', description: 'Log helper steps while the script runs' },
      { name: '--logs-off', description: 'Hide the always-on subAgent streaming logs' },
    ],
    flags: [
      { name: '--skip-connection-check', description: 'Skip the connected-account check' },
      {
        name: '--skip-tool-params-check',
        description: 'Skip input validation against cached schema',
      },
      { name: '--skip-checks', description: 'Skip both checks above' },
    ],
    injectedHelpers: [
      {
        name: 'execute(slug, data?)',
        description: 'Run a tool — same as `composio execute`, returns parsed JSON',
      },
      { name: 'search(query, opts?)', description: 'Find tools — same as `composio search`' },
      { name: 'proxy(toolkit)', description: 'Returns a fetch() bound to your connected account' },
      {
        name: 'subAgent(prompt, opts?)',
        description: 'Spawn a sub-agent (Claude/Codex) with optional structured output',
      },
      {
        name: 'result.prompt()',
        description: 'Serialize any helper result into an LLM-friendly string',
      },
      { name: 'z', description: 'Global from zod for defining structured output schemas' },
    ],
    examples: [
      `composio run '`,
      `  // execute(slug, data?) — run a tool, returns parsed JSON`,
      `  const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER");`,
      `  console.log(me);`,
      `'`,
      '',
      `composio run '`,
      `  // search(query, opts?) — find tools by use case`,
      `  const tools = await search("send email");`,
      `  console.log(tools);`,
      `'`,
      '',
      '# Sequential: chain tool outputs across services',
      `composio run '`,
      `  const issue = await execute("GITHUB_CREATE_ISSUE", { owner: "acme", repo: "app", title: "Deploy v2" });`,
      `  await execute("SLACK_SEND_A_MESSAGE_TO_A_SLACK_CHANNEL", { channel: "eng", text: "Created: " + issue.data.html_url });`,
      `'`,
      '',
      '# Parallel: fetch from multiple services at once with Promise.all',
      `composio run '`,
      `  const [emails, issues, events] = await Promise.all([`,
      `    execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),`,
      `    execute("GITHUB_LIST_REPOSITORY_ISSUES", { owner: "composiohq", repo: "composio", state: "open" }),`,
      `    execute("GOOGLECALENDAR_FIND_EVENT", { calendar_id: "primary" }),`,
      `  ]);`,
      `  console.log({ emails: emails.data, issues: issues.data, events: events.data });`,
      `'`,
      '',
      '# Bulk: fan out with Promise.all + .map()',
      `composio run '`,
      `  const issues = [101, 102, 103, 104];`,
      `  await Promise.all(issues.map(n =>`,
      `    execute("GITHUB_ADD_LABELS_TO_ISSUE", { owner: "acme", repo: "app", issue_number: n, labels: ["priority"] })`,
      `  ));`,
      `'`,
      '',
      '# proxy(toolkit) — returns a fetch() bound to your connected account',
      `composio run '`,
      `  const f = await proxy("gmail");`,
      `  console.log(await f("https://gmail.googleapis.com/gmail/v1/users/me/profile"));`,
      `'`,
      '',
      '# subAgent + z + result.prompt() — structured output from a sub-agent',
      `composio run '`,
      `  const [emails, issues] = await Promise.all([`,
      `    execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),`,
      `    execute("GITHUB_LIST_REPOSITORY_ISSUES", { owner: "composiohq", repo: "composio", state: "open" }),`,
      `  ]);`,
      `  // result.prompt() serializes helper output for LLM consumption`,
      `  // z is a global from zod for defining structured output schemas`,
      `  const brief = await subAgent(`,
      `    \`Summarize these emails and issues.\\n\\n\${emails.prompt()}\\n\\n\${issues.prompt()}\`,`,
      `    { schema: z.object({ summary: z.string(), urgent: z.array(z.string()) }) }`,
      `  );`,
      `  console.log(brief.structuredOutput);`,
      `'`,
      '',
      '# Run from a file',
      'composio run --file ./workflow.ts -- --repo acme/app',
    ],
    seeAlso: [
      'composio search "<query>"               Discover tool slugs before scripting',
      'composio link <toolkit>                  Connect accounts before scripting',
      'composio execute <slug> --get-schema     Inspect tool inputs before scripting',
      'composio artifacts cwd                   Print the current session artifact directory',
    ],
  },
  proxy: {
    usage: 'composio proxy <url> --toolkit <text> [-X method] [-H header]... [-d data]',
    description:
      'curl-like access to any toolkit API through Composio using your connected account. Composio handles authentication — just provide the full URL and toolkit.',
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
    flags: [{ name: '--skip-connection-check', description: 'Skip the connected-account check' }],
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

  // ── Account commands ──────────────────────────────────────────────────

  login: {
    usage: 'composio login [--no-browser] [--no-wait] [--key text] [-y, --yes]',
    description: 'Log in to the Composio CLI session.',
    options: [
      {
        name: '--key <text>',
        description: 'Complete login using session key from composio login --no-wait',
      },
    ],
    flags: [
      { name: '--no-browser', description: 'Login without browser interaction' },
      { name: '--no-wait', description: 'Print login URL and session info, then exit' },
      { name: '-y, --yes', description: 'Skip org picker; use session default org' },
    ],
  },
  logout: {
    usage: 'composio logout',
    description: 'Log out from the Composio CLI session.',
  },
  whoami: {
    usage: 'composio whoami',
    description: 'Display your account information.',
  },
  version: {
    usage: 'composio version',
    description: 'Display the current Composio CLI version.',
  },
  upgrade: {
    usage: 'composio upgrade',
    description: 'Upgrade your Composio CLI to the latest available version.',
  },

  // ── Tools commands ────────────────────────────────────────────────────

  'tools list': {
    usage: 'composio tools list <toolkit> [--query text] [--tags text] [--limit integer]',
    description: 'List available tools for a toolkit.',
    args: [{ name: '<toolkit>', description: 'Toolkit slug to list tools for (e.g. "gmail")' }],
    options: [
      { name: '--query <text>', description: 'Text search by name, slug, or description' },
      { name: '--tags <text>', description: 'Filter by tags (e.g. "important")' },
      { name: '--limit <integer>', description: 'Maximum number of results (1-1000)' },
    ],
  },
  'tools info': {
    usage: 'composio tools info [<slug>]',
    description:
      'View a brief summary of a tool and cache the raw schema used by `composio execute --get-schema`.',
    args: [{ name: '<slug>', description: 'Tool slug (e.g. "GMAIL_SEND_EMAIL")' }],
  },

  // ── Generate commands ─────────────────────────────────────────────────

  generate: {
    usage: 'composio generate [--output-dir dir] [--type-tools] --toolkits text...',
    description:
      'Generate type stubs for toolkits, tools, and triggers, auto-detecting project language (TypeScript | Python).',
    options: [
      { name: '-o, --output-dir <dir>', description: 'Output directory for type stubs' },
      {
        name: '--toolkits <text>... (required)',
        description: 'Toolkits to generate for (repeat for multiple)',
      },
    ],
    flags: [
      {
        name: '--type-tools',
        description: 'Generate typed input/output schemas for each tool (slower)',
      },
    ],
  },
  'generate ts': {
    usage:
      'composio generate ts [--output-dir dir] [--compact] [--transpiled] [--type-tools] --toolkits text...',
    description: 'Generate TypeScript type stubs for toolkits, tools, and triggers.',
    options: [
      {
        name: '-o, --output-dir <dir>',
        description: 'Output directory for generated TypeScript stubs',
      },
      {
        name: '--toolkits <text>... (required)',
        description: 'Toolkits to generate for (repeat for multiple)',
      },
    ],
    flags: [
      { name: '--compact', description: 'Emit a single TypeScript file' },
      {
        name: '--transpiled',
        description: 'Emit transpiled JavaScript alongside TypeScript files',
      },
      {
        name: '--type-tools',
        description: 'Generate typed input/output schemas for each tool (slower)',
      },
    ],
  },
  'generate py': {
    usage: 'composio generate py [--output-dir dir] --toolkits text...',
    description: 'Generate Python type stubs for toolkits, tools, and triggers.',
    options: [
      {
        name: '-o, --output-dir <dir>',
        description: 'Output directory for generated Python stubs',
      },
      {
        name: '--toolkits <text>... (required)',
        description: 'Toolkits to generate for (repeat for multiple)',
      },
    ],
  },

  // ── Dev commands ──────────────────────────────────────────────────────

  'dev init': {
    usage: 'composio dev init [--no-browser] [-y, --yes]',
    description: 'Initialize this directory with a developer project.',
    flags: [
      { name: '--no-browser', description: 'Login without browser interaction' },
      { name: '-y, --yes', description: 'Auto-select the default org project' },
    ],
  },
  'dev playground-execute': {
    usage:
      'composio dev playground-execute <slug> [-d, --data text] [--user-id text] [--project-name text] [--dry-run] [--get-schema]',
    description:
      'Test tool executions against playground users using your developer project auth configs.',
    args: [{ name: '<slug>', description: 'Tool slug (e.g. "GITHUB_CREATE_ISSUE")' }],
    options: [
      { name: '-d, --data <text>', description: 'JSON arguments, @file, or - for stdin' },
      { name: '--user-id <text>', description: 'Developer-project user ID override' },
      { name: '--project-name <text>', description: 'Developer project name override' },
      {
        name: '--get-schema',
        description: 'Fetch and print the raw tool schema without executing',
      },
      { name: '--dry-run', description: 'Validate and preview without executing' },
    ],
    flags: [
      { name: '--skip-connection-check', description: 'Skip the connected-account check' },
      {
        name: '--skip-tool-params-check',
        description: 'Skip input validation against cached schema',
      },
      { name: '--skip-checks', description: 'Skip both checks above' },
    ],
  },
  'dev listen': {
    usage:
      'composio dev listen [--toolkits text] [--trigger-slug text] [--json] [--table] [--max-events int] [--forward url] [--out file]',
    description:
      'Listen to realtime trigger events for your developer project and optionally forward them.',
    options: [
      { name: '--toolkits <text>', description: 'Filter by toolkit slugs, comma-separated' },
      { name: '--trigger-id <text>', description: 'Filter by trigger id' },
      { name: '--connected-account-id <text>', description: 'Filter by connected account id' },
      { name: '--trigger-slug <text>', description: 'Filter by trigger slug, comma-separated' },
      { name: '--user-id <text>', description: 'Filter by user id' },
      { name: '--max-events <int>', description: 'Stop after receiving N matching events' },
      { name: '--forward <url>', description: 'Forward each event to the given URL' },
      { name: '--out <file>', description: 'Append each event to this file' },
    ],
    flags: [
      { name: '--json', description: 'Show raw event payload as JSON' },
      { name: '--table', description: 'Show compact table rows' },
    ],
  },
  // ── Dev admin commands ─────────────────────────────────────────────────

  'dev toolkits list': {
    usage:
      'composio dev toolkits list [--query text] [--limit integer] [--connected] [--user-id text]',
    description: 'List available toolkits with connection status.',
    options: [
      { name: '--query <text>', description: 'Text search by name, slug, or description' },
      { name: '--limit <integer>', description: 'Maximum number of results (1-1000)' },
      { name: '--user-id <text>', description: 'User ID override' },
    ],
    flags: [{ name: '--connected', description: 'Show only connected toolkits' }],
  },
  'dev toolkits info': {
    usage: 'composio dev toolkits info [--user-id text] [-a, --all] [<slug>]',
    description: 'View details of a specific toolkit.',
    args: [{ name: '<slug>', description: 'Toolkit slug (e.g. "github")' }],
    flags: [{ name: '-a, --all', description: 'Show all details' }],
  },
  'dev toolkits search': {
    usage: 'composio dev toolkits search <query> [--limit integer]',
    description: 'Search toolkits by use case.',
    args: [{ name: '<query>', description: 'Search query' }],
    options: [{ name: '--limit <integer>', description: 'Number of results' }],
  },
  'dev toolkits version': {
    usage: 'composio dev toolkits version <slug>',
    description: 'Show latest and recent versions for a toolkit.',
    args: [{ name: '<slug>', description: 'Toolkit slug' }],
  },
  'dev auth-configs list': {
    usage: 'composio dev auth-configs list [--toolkits text] [--query text] [--limit integer]',
    description: 'List auth configs.',
    options: [
      { name: '--toolkits <text>', description: 'Filter by toolkit slugs' },
      { name: '--query <text>', description: 'Search text' },
      { name: '--limit <integer>', description: 'Number of results' },
    ],
  },
  'dev auth-configs info': {
    usage: 'composio dev auth-configs info [<id>]',
    description: 'View details of a specific auth config.',
    args: [{ name: '<id>', description: 'Auth config ID' }],
  },
  'dev auth-configs create': {
    usage:
      'composio dev auth-configs create --toolkit text [--auth-scheme text] [--scopes text] [--custom-credentials text] [<name>]',
    description: 'Create a new auth config.',
    args: [{ name: '<name>', description: 'Auth config name' }],
    options: [
      { name: '--toolkit <text>', description: 'Toolkit slug' },
      { name: '--auth-scheme <text>', description: 'Authentication scheme' },
      { name: '--scopes <text>', description: 'Comma-separated scopes' },
      { name: '--custom-credentials <text>', description: 'Custom credentials JSON' },
    ],
  },
  'dev auth-configs delete': {
    usage: 'composio dev auth-configs delete [-y, --yes] [<id>]',
    description: 'Delete an auth config.',
    args: [{ name: '<id>', description: 'Auth config ID' }],
    flags: [{ name: '-y, --yes', description: 'Skip confirmation prompt' }],
  },
  'dev connected-accounts list': {
    usage:
      'composio dev connected-accounts list [--toolkits text] [--user-id text] [--status text] [--limit integer]',
    description: 'List connected accounts.',
    options: [
      { name: '--toolkits <text>', description: 'Filter by toolkit slugs' },
      { name: '--user-id <text>', description: 'Filter by user id' },
      { name: '--status <text>', description: 'Filter by status (ACTIVE, FAILED, EXPIRED, etc.)' },
      { name: '--limit <integer>', description: 'Number of results' },
    ],
  },
  'dev connected-accounts info': {
    usage: 'composio dev connected-accounts info [<id>]',
    description: 'View details of a specific connected account.',
    args: [{ name: '<id>', description: 'Connected account ID' }],
  },
  'dev connected-accounts whoami': {
    usage: 'composio dev connected-accounts whoami [<id>]',
    description: 'Show the external account profile for a connected account.',
    args: [{ name: '<id>', description: 'Connected account ID' }],
  },
  'dev connected-accounts delete': {
    usage: 'composio dev connected-accounts delete [-y, --yes] [<id>]',
    description: 'Delete a connected account.',
    args: [{ name: '<id>', description: 'Connected account ID' }],
    flags: [{ name: '-y, --yes', description: 'Skip confirmation prompt' }],
  },
  'dev triggers list': {
    usage: 'composio dev triggers list [--toolkits text] [--limit integer]',
    description: 'List available trigger types.',
    options: [
      { name: '--toolkits <text>', description: 'Filter by toolkit slugs' },
      { name: '--limit <integer>', description: 'Number of results' },
    ],
  },
  'dev triggers info': {
    usage: 'composio dev triggers info [<slug>]',
    description: 'View details of a specific trigger type.',
    args: [{ name: '<slug>', description: 'Trigger slug' }],
  },
  'dev triggers status': {
    usage:
      'composio dev triggers status [--user-ids text] [--toolkits text] [--trigger-ids text] [--show-disabled] [--limit integer]',
    description: 'Show active triggers with optional filters.',
    options: [
      { name: '--user-ids <text>', description: 'Filter by user IDs' },
      { name: '--connected-account-ids <text>', description: 'Filter by connected account IDs' },
      { name: '--toolkits <text>', description: 'Filter by toolkit slugs' },
      { name: '--trigger-ids <text>', description: 'Filter by trigger IDs' },
      { name: '--trigger-names <text>', description: 'Filter by trigger names' },
      { name: '--limit <integer>', description: 'Number of results' },
    ],
    flags: [{ name: '--show-disabled', description: 'Include disabled triggers' }],
  },
  'dev triggers create': {
    usage:
      'composio dev triggers create [--connected-account-id text] [--trigger-config text] [<trigger-name>]',
    description: 'Create a new trigger instance.',
    args: [{ name: '<trigger-name>', description: 'Trigger type slug' }],
    options: [
      { name: '--connected-account-id <text>', description: 'Connected account to use' },
      { name: '--trigger-config <text>', description: 'Trigger configuration JSON' },
    ],
  },
  'dev triggers enable': {
    usage: 'composio dev triggers enable [<id>]',
    description: 'Enable a trigger instance.',
    args: [{ name: '<id>', description: 'Trigger instance ID' }],
  },
  'dev triggers disable': {
    usage: 'composio dev triggers disable [<id>]',
    description: 'Disable a trigger instance.',
    args: [{ name: '<id>', description: 'Trigger instance ID' }],
  },
  'dev triggers delete': {
    usage: 'composio dev triggers delete [-y, --yes] [<id>]',
    description: 'Delete a trigger instance.',
    args: [{ name: '<id>', description: 'Trigger instance ID' }],
    flags: [{ name: '-y, --yes', description: 'Skip confirmation prompt' }],
  },
  'dev orgs list': {
    usage: 'composio dev orgs list [--limit integer]',
    description: 'List organizations and show current global selection.',
    options: [{ name: '--limit <integer>', description: 'Number of results' }],
  },
  'dev orgs switch': {
    usage: 'composio dev orgs switch [--org-id text] [--limit integer]',
    description: 'Switch default organization context.',
    options: [
      { name: '--org-id <text>', description: 'Organization ID to switch to' },
      { name: '--limit <integer>', description: 'Number of orgs to show in picker' },
    ],
  },
  'dev projects list': {
    usage: 'composio dev projects list [--org-id text] [--limit integer]',
    description: 'List developer projects for the current organization.',
    options: [
      { name: '--org-id <text>', description: 'Organization ID override' },
      { name: '--limit <integer>', description: 'Number of results' },
    ],
  },

  // ── Dev logs commands ─────────────────────────────────────────────────

  'dev logs tools': {
    usage:
      'composio dev logs tools [--toolkit text] [--tool text] [--status text] [--limit integer] [<log_id>]',
    description: 'List tool execution logs, or pass a log_id to fetch a specific log.',
    args: [{ name: '<log_id>', description: 'Specific log ID to fetch' }],
    options: [
      { name: '--toolkit <text>', description: 'Filter by toolkit slug' },
      { name: '--tool <text>', description: 'Filter by tool slug' },
      { name: '--status <text>', description: 'Filter by status' },
      { name: '--user-id <text>', description: 'Filter by user id' },
      { name: '--limit <integer>', description: 'Number of results' },
      { name: '--from <integer>', description: 'Start timestamp (epoch ms)' },
      { name: '--to <integer>', description: 'End timestamp (epoch ms)' },
    ],
    flags: [{ name: '--case-sensitive', description: 'Case-sensitive filtering' }],
  },
  'dev logs triggers': {
    usage:
      'composio dev logs triggers [--trigger text] [--trigger-id text] [--limit integer] [--time 5m|30m|6h|1d|1w] [<log_id>]',
    description: 'List trigger logs.',
    args: [{ name: '<log_id>', description: 'Specific log ID to fetch' }],
    options: [
      { name: '--trigger <text>', description: 'Filter by trigger slug' },
      { name: '--trigger-id <text>', description: 'Filter by trigger id' },
      { name: '--user-id <text>', description: 'Filter by user id' },
      { name: '--connected-account-id <text>', description: 'Filter by connected account id' },
      { name: '--limit <integer>', description: 'Number of results' },
      { name: '--time <period>', description: 'Time window (5m, 30m, 6h, 1d, 1w, 1month, 1y)' },
      { name: '--search <text>', description: 'Search in log content' },
    ],
    flags: [{ name: '--include-payload', description: 'Include full event payload' }],
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

  if (cmd.injectedHelpers && cmd.injectedHelpers.length > 0) {
    lines.push(bold('INJECTED HELPERS'));
    const maxLen = Math.max(...cmd.injectedHelpers.map(h => h.name.length));
    for (const helper of cmd.injectedHelpers) {
      lines.push(`  ${dim(helper.name.padEnd(maxLen + 2))}${helper.description}`);
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
  if (args.length < 2) return undefined;
  const last = args[args.length - 1];
  if (last !== '--help' && last !== '-h') return undefined;

  const cmdParts = args.slice(0, -1);
  // Try longest match first: "dev toolkits list" → "dev toolkits" → "dev"
  for (let len = cmdParts.length; len > 0; len--) {
    const key = cmdParts.slice(0, len).join(' ');
    if (key in SUBCOMMAND_HELP) return key;
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
    'playground execution, logs, and developer-scoped management commands.',
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
