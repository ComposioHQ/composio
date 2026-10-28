import { Argument, Command, Flag } from 'effect/cli';
import { withCommandMeta } from 'src/invocation/command-identity';
import { runToolsExecuteCommand } from './tools.execute.handler';

const slug = Argument.String('slug').pipe(
  Argument.withDescription('Tool slug (e.g. "GITHUB_CREATE_ISSUE")')
);

const additionalSlugs = Argument.String('additional-slugs').pipe(
  Argument.variadic(),
  Argument.withDescription('Additional tool slugs for --parallel')
);
const parallel = Flag.Boolean('parallel').pipe(
  Flag.withAlias('p'),
  Flag.withDefault(false),
  Flag.withDescription('Execute repeated tool slug/data groups concurrently')
);

const data = Flag.String('data').pipe(
  Flag.withAlias('d'),
  Flag.withDescription('JSON arguments, @file, or - for stdin'),
  Flag.optional
);
const file = Flag.String('file').pipe(
  Flag.withDescription('Inject a local file path into the single file_uploadable input'),
  Flag.optional
);
const accountOption = Flag.String('account').pipe(
  Flag.withDescription(
    'Connected account selector for the inferred toolkit. Matches alias, word_id, or connected account id.'
  ),
  Flag.optional
);

const getSchema = Flag.Boolean('get-schema').pipe(
  Flag.withDescription('Fetch and print the CLI-facing input schema without executing'),
  Flag.withDefault(false)
);
const dryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDescription('Validate and preview the tool call without executing'),
  Flag.withDefault(false)
);
const skipConnectionCheck = Flag.Boolean('skip-connection-check').pipe(
  Flag.withDescription('Skip the connected-account check'),
  Flag.withDefault(false)
);
const skipToolParamsCheck = Flag.Boolean('skip-tool-params-check').pipe(
  Flag.withDescription('Skip input validation against cached schema'),
  Flag.withDefault(false)
);
const skipChecks = Flag.Boolean('skip-checks').pipe(
  Flag.withDescription('Skip both connection and input validation checks'),
  Flag.withDefault(false)
);

const executeExamples = [
  {
    command:
      'composio execute GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com", subject: "Hello", body: "World" }\'',
    description: 'Send an email',
  },
  {
    command:
      'composio execute GITHUB_CREATE_ISSUE --account work -d \'{ owner: "acme", repo: "app", title: "Bug report", body: "Steps to reproduce..." }\'',
    description: 'Create a GitHub issue with a named account',
  },
  {
    command:
      'composio execute SLACK_SEND_MESSAGE --dry-run -d \'{ channel: "general", markdown_text: "Hello team" }\'',
    description: 'Preview what a tool call would send without executing',
  },
  {
    command: 'composio execute GMAIL_SEND_EMAIL --get-schema',
    description: 'Print the tool input schema as JSON (--help shows command options)',
  },
  {
    command: 'composio execute GITHUB_CREATE_ISSUE -d @issue.json',
    description: 'Read arguments from a file',
  },
  {
    command:
      'composio execute -p GMAIL_SEND_EMAIL -d \'{ recipient_email: "a@b.com" }\' GITHUB_CREATE_AN_ISSUE -d \'{ owner: "acme", repo: "app", title: "Bug" }\'',
    description: 'Execute multiple tools concurrently',
  },
];

export const rootToolsCmd$Execute = Command.make(
  'execute',
  {
    slug,
    additionalSlugs,
    parallel,
    data,
    file,
    account: accountOption,
    getSchema,
    dryRun,
    skipConnectionCheck,
    skipToolParamsCheck,
    skipChecks,
  },
  runToolsExecuteCommand
).pipe(
  Command.withDescription(
    'Execute a tool by slug. Validates inputs against cached schemas and checks connections\nautomatically — just try it and it will tell you what to fix.'
  ),
  Command.withShortDescription(
    'Execute a tool by slug. Validates inputs against cached schemas and checks connections'
  ),
  Command.withExamples(executeExamples),
  withCommandMeta({ requiresLogin: true })
);

export const devToolsCmd$Execute = Command.make(
  'playground-execute',
  {
    slug,
    additionalSlugs,
    parallel,
    data,
    file,
    account: accountOption,
    getSchema,
    dryRun,
    skipConnectionCheck,
    skipToolParamsCheck,
    skipChecks,
  },
  runToolsExecuteCommand
).pipe(
  Command.withDescription(
    'Test tool executions against playground users using your developer project auth configs.\nUses --user-id when provided, otherwise falls back to your local or global playground test user id.\nArguments are validated against cached tool schemas in `~/.composio/tool_definitions/` when available.'
  ),
  Command.withShortDescription(
    'Test tool executions against playground users using your developer project auth configs.'
  ),
  Command.withExamples(
    executeExamples.map(example => ({
      ...example,
      command: example.command.replace('composio execute', 'composio dev playground-execute'),
    }))
  ),
  withCommandMeta({ requiresLogin: true })
);
