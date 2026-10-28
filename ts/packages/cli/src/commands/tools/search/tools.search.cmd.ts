import { Argument, Command, Flag } from 'effect/cli';
import { withCommandMeta } from 'src/invocation/command-identity';
import { runToolsSearch } from './tools.search.handler';

const query = Argument.String('query').pipe(
  Argument.variadic(),
  Argument.withDescription(
    'One or more semantic use-case queries (e.g. "onboard a new GitHub repo", "notify Slack").'
  )
);

const toolkits = Flag.String('toolkits').pipe(
  Flag.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail,outlook")'),
  Flag.optional
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(10),
  Flag.withDescription('Number of results per page (1-1000)')
);

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Print the full search response as JSON (default behavior)')
);

const human = Flag.Boolean('human').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Show formatted human-readable search output')
);

export const toolsCmd$Search = Command.make(
  'search',
  { query, toolkits, limit, json, human },
  runToolsSearch
).pipe(
  Command.withDescription(
    'Find tools by use case. Defaults to full JSON output; use `--human` for formatted output.'
  ),
  Command.withShortDescription(
    'Find tools by use case. Defaults to full JSON output; use `--human` for formatted output.'
  ),
  Command.withExamples([
    {
      command: 'composio search "send an email"',
      description: 'Find tools for a use case',
    },
    {
      command: 'composio search "send an email" "create github issue"',
    },
    {
      command: 'composio search "my emails" "my github issues" --toolkits gmail,github',
    },
    {
      command: 'composio search "create issue" --toolkits github',
    },
    {
      command: 'composio search "send an email" --human',
    },
    {
      command: 'composio search "post a message to a slack channel"',
      description: 'Cross-app workflow discovery',
    },
    {
      command: 'composio search "add a row to google sheet"',
    },
    {
      command: 'composio search "list calendar events" --toolkits google_calendar --limit 5',
      description: 'Narrow results to a specific toolkit',
    },
  ]),
  withCommandMeta({ requiresLogin: true })
);
