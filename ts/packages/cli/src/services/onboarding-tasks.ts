import { Array as Arr, Option, Predicate } from 'effect';

/**
 * A curated "first thing to do with Composio" entry.
 *
 * The registry is the reason `composio onboard` can ask the user what they want to do before
 * asking which toolkit to connect: the task supplies the toolkit, not the other way round.
 *
 * `read` is always an argument-free (or fixed-argument) read against the provider, so the demo
 * cannot be turned into a write by anything the user types. `create` is optional and always
 * gated behind explicit prompts — see the reversible-create conditions in the onboard command.
 */
export type StarterTask = {
  readonly id: string;
  readonly label: string;
  readonly toolkit: string;
  readonly read: {
    readonly slug: string;
    readonly args: Readonly<Record<string, unknown>>;
    readonly summarize?: (data: Record<string, unknown>) => string | undefined;
  };
  readonly create?: {
    readonly slug: string;
    readonly confirmLabel: string;
    readonly requiredArgs: ReadonlyArray<{
      readonly key: string;
      readonly prompt: string;
      readonly placeholder?: string;
    }>;
    readonly fixedArgs?: Readonly<Record<string, unknown>>;
    readonly summarize?: (data: Record<string, unknown>) => string | undefined;
  };
};

const asString = (value: unknown): string | undefined =>
  Predicate.isString(value) && value.trim().length > 0 ? value : undefined;

/**
 * Narrow a provider response to something a summarizer can index into.
 *
 * The response is an arbitrary third-party payload typed `unknown`, so this is the trust boundary
 * for it. Shared with `onboard.cmd.ts`, which hands the same value to the same summarizers.
 */
export const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  Predicate.isRecord(value) ? (value as Record<string, unknown>) : undefined;

const asArray = (value: unknown): ReadonlyArray<unknown> | undefined =>
  Arr.isArray(value) ? value : undefined;

/**
 * Every summarizer returns `undefined` when the response does not have the shape it expects,
 * so a drifted provider payload falls back to a generic line instead of a sentence assembled
 * from missing fields.
 */
export const ONBOARD_TASKS: ReadonlyArray<StarterTask> = [
  {
    id: 'check-my-github',
    label: 'Check my GitHub account',
    toolkit: 'github',
    read: {
      slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
      args: {},
      summarize: data => {
        const login = asString(asRecord(data['data'])?.['login']) ?? asString(data['login']);
        return login === undefined ? undefined : `Signed in to GitHub as ${login}.`;
      },
    },
    create: {
      slug: 'GITHUB_CREATE_AN_ISSUE',
      confirmLabel: 'Create a GitHub issue to prove writes work?',
      requiredArgs: [
        { key: 'owner', prompt: 'Repository owner', placeholder: 'your-github-username' },
        { key: 'repo', prompt: 'Repository name', placeholder: 'sandbox' },
        { key: 'title', prompt: 'Issue title', placeholder: 'Hello from Composio' },
      ],
      summarize: data => {
        const url = asString(asRecord(data['data'])?.['html_url']) ?? asString(data['html_url']);
        return url === undefined ? undefined : `Created ${url}`;
      },
    },
  },
  {
    id: 'read-my-inbox',
    label: 'Read my latest emails',
    toolkit: 'gmail',
    read: {
      slug: 'GMAIL_FETCH_EMAILS',
      args: { max_results: 3, verbose: false },
      summarize: data => {
        const messages = asArray(asRecord(data['data'])?.['messages']) ?? asArray(data['messages']);
        return messages === undefined
          ? undefined
          : `Read ${messages.length} message(s) from Gmail.`;
      },
    },
  },
  {
    id: 'list-slack-channels',
    label: 'List my Slack channels',
    toolkit: 'slack',
    read: {
      slug: 'SLACK_LIST_ALL_CHANNELS',
      args: { limit: 10 },
      summarize: data => {
        const channels = asArray(asRecord(data['data'])?.['channels']) ?? asArray(data['channels']);
        return channels === undefined ? undefined : `Found ${channels.length} Slack channel(s).`;
      },
    },
  },
  {
    id: 'see-my-linear-issues',
    label: 'See my Linear issues',
    toolkit: 'linear',
    read: {
      slug: 'LINEAR_LIST_LINEAR_ISSUES',
      args: { first: 5 },
      summarize: data => {
        const issues = asArray(asRecord(data['data'])?.['issues']) ?? asArray(data['issues']);
        return issues === undefined ? undefined : `Found ${issues.length} Linear issue(s).`;
      },
    },
    create: {
      slug: 'LINEAR_CREATE_LINEAR_ISSUE',
      confirmLabel: 'Create a Linear issue to prove writes work?',
      requiredArgs: [
        { key: 'team_id', prompt: 'Linear team id', placeholder: 'team_...' },
        { key: 'title', prompt: 'Issue title', placeholder: 'Hello from Composio' },
      ],
      summarize: data => {
        const url = asString(asRecord(data['data'])?.['url']) ?? asString(data['url']);
        return url === undefined ? undefined : `Created ${url}`;
      },
    },
  },
  {
    id: 'search-my-notion',
    label: 'Search my Notion pages',
    toolkit: 'notion',
    read: {
      slug: 'NOTION_SEARCH_NOTION_PAGE',
      args: { query: '', page_size: 5 },
      summarize: data => {
        const results = asArray(asRecord(data['data'])?.['results']) ?? asArray(data['results']);
        return results === undefined ? undefined : `Found ${results.length} Notion result(s).`;
      },
    },
  },
];

/** The curated toolkit slugs, in registry order. Emitted as `available_toolkits` data. */
export const onboardToolkitSlugs = (): ReadonlyArray<string> =>
  ONBOARD_TASKS.map(task => task.toolkit);

/** Exact toolkit-slug lookup, case-insensitive. */
export const findTaskByToolkit = (slug: string): Option.Option<StarterTask> => {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0) {
    return Option.none();
  }
  return Arr.findFirst(ONBOARD_TASKS, task => task.toolkit === normalized);
};
