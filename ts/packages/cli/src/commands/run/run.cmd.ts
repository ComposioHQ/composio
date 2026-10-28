import { Argument, Command, Flag } from 'effect/cli';
import { CLI_DEBUG_FLAG_NAMES } from 'src/services/runtime-flags';
import { runScript } from './run.handler';

const RUN_FLAG_NAMES = {
  file: 'file',
  dryRun: 'dry-run',
  debug: 'debug',
  skipConnectionCheck: 'skip-connection-check',
  skipToolParamsCheck: 'skip-tool-params-check',
  skipChecks: 'skip-checks',
} as const;

const file = Flag.String(RUN_FLAG_NAMES.file).pipe(
  Flag.withAlias('f'),
  Flag.withDescription('Run a TS/JS file instead of inline code'),
  Flag.optional
);

const dryRun = Flag.Boolean(RUN_FLAG_NAMES.dryRun).pipe(
  Flag.withDescription('Preview execute() calls without running them'),
  Flag.withDefault(false)
);
const debug = Flag.Boolean(RUN_FLAG_NAMES.debug).pipe(
  Flag.withDescription('Log helper steps while the script runs'),
  Flag.withDefault(false)
);
const skipConnectionCheck = Flag.Boolean(RUN_FLAG_NAMES.skipConnectionCheck).pipe(
  Flag.withDescription('Skip the connected-account check'),
  Flag.withDefault(false)
);
const skipToolParamsCheck = Flag.Boolean(RUN_FLAG_NAMES.skipToolParamsCheck).pipe(
  Flag.withDescription('Skip input validation against cached schema'),
  Flag.withDefault(false)
);
const skipChecks = Flag.Boolean(RUN_FLAG_NAMES.skipChecks).pipe(
  Flag.withDescription('Skip both connection and input validation checks'),
  Flag.withDefault(false)
);

const runFlags = {
  file,
  dryRun,
  debug,
  skipConnectionCheck,
  skipToolParamsCheck,
  skipChecks,
};

/** Share names with the passthrough adapter; the framework owns parsing the flag values. */
export const RUN_FILE_FLAGS = new Set([`--${RUN_FLAG_NAMES.file}`, '-f']);
export const RUN_KNOWN_VALUE_FLAGS = new Set([...RUN_FILE_FLAGS, '--log-level']);
export const RUN_KNOWN_BOOLEAN_FLAGS = new Set([
  ...Object.values(RUN_FLAG_NAMES)
    .filter(name => name !== RUN_FLAG_NAMES.file)
    .map(name => `--${name}`),
  ...CLI_DEBUG_FLAG_NAMES.flatMap(name => [`--${name}`, `--no-${name}`]),
  '--help',
  '-h',
  '--version',
  '-v',
]);

const args = Argument.String('arg').pipe(
  Argument.variadic(),
  Argument.withDescription('Inline code followed by arguments, or just arguments when using --file')
);

export const runCmd = Command.make(
  'run',
  {
    ...runFlags,
    args,
  },
  runScript
).pipe(
  Command.withDescription(
    'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.\n\nInjected helpers (behave like their CLI counterparts):\n  execute(slug, data?)          Same as `composio execute` — returns parsed JSON\n  search(query, options?)        Same as `composio search` — returns matching tools\n  result.prompt()                Prompt-safe serialization of a helper result\n  const f = await proxy(toolkit) Same as `composio proxy` — returns a fetch function\n                                 Example: const f = await proxy("gmail")\n                                          const me = await f("https://gmail.googleapis.com/gmail/v1/users/me/profile")\n  z                              Injected global from `zod` for defining and validating schemas\n\nAll helpers reuse your CLI auth state and connected accounts.\n\nUse composio search "<query>" to discover tools and composio execute <slug> --get-schema to inspect inputs.'
  ),
  Command.withShortDescription(
    'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.'
  ),
  Command.withExamples([
    {
      command:
        'composio run \'\n  // execute(slug, data?) — run a tool, returns parsed JSON\n  const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER");\n  console.log(me);\n\'',
    },
    {
      command:
        'composio run \'\n  // search(query, opts?) — find tools by use case\n  const tools = await search("send email");\n  console.log(tools);\n\'',
    },
    {
      command:
        'composio run \'\n  const issue = await execute("GITHUB_CREATE_ISSUE", { owner: "acme", repo: "app", title: "Deploy v2" });\n  await execute("SLACK_SEND_MESSAGE", { channel: "eng", markdown_text: "Created: " + issue.data.html_url });\n\'',
      description: 'Sequential: chain tool outputs across services',
    },
    {
      command:
        'composio run \'\n  const [emails, issues, events] = await Promise.all([\n    execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),\n    execute("GITHUB_LIST_REPOSITORY_ISSUES", { owner: "composiohq", repo: "composio", state: "open" }),\n    execute("GOOGLECALENDAR_FIND_EVENT", { calendar_id: "primary" }),\n  ]);\n  console.log({ emails: emails.data, issues: issues.data, events: events.data });\n\'',
      description: 'Parallel: fetch from multiple services at once with Promise.all',
    },
    {
      command:
        'composio run \'\n  const issues = [101, 102, 103, 104];\n  await Promise.all(issues.map(n =>\n    execute("GITHUB_ADD_LABELS_TO_ISSUE", { owner: "acme", repo: "app", issue_number: n, labels: ["priority"] })\n  ));\n\'',
      description: 'Bulk: fan out with Promise.all + .map()',
    },
    {
      command:
        'composio run \'\n  const f = await proxy("gmail");\n  console.log(await f("https://gmail.googleapis.com/gmail/v1/users/me/profile"));\n\'',
      description: 'proxy(toolkit) — returns a fetch() bound to your connected account',
    },
    {
      command: 'composio run --file ./workflow.ts -- --repo acme/app',
      description: 'Run from a file',
    },
  ])
);
