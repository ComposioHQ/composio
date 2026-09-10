import { Array as Arr, Option, Schema } from 'effect';

export const CuratedToolkit = Schema.Literal('github', 'gmail', 'slack', 'linear', 'notion');
export type CuratedToolkit = Schema.Schema.Type<typeof CuratedToolkit>;

export type CuratedOnboardingTask = {
  readonly label: string;
  readonly toolkit: CuratedToolkit;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly summarize: (payload: unknown) => string | undefined;
};

const GitHubSummary = Schema.Struct({
  data: Schema.optional(Schema.Struct({ login: Schema.String })),
  login: Schema.optional(Schema.String),
});
const GmailSummary = Schema.Struct({
  data: Schema.optional(Schema.Struct({ messages: Schema.Array(Schema.Unknown) })),
  messages: Schema.optional(Schema.Array(Schema.Unknown)),
});
const SlackSummary = Schema.Struct({
  data: Schema.optional(Schema.Struct({ channels: Schema.Array(Schema.Unknown) })),
  channels: Schema.optional(Schema.Array(Schema.Unknown)),
});
const LinearSummary = Schema.Struct({
  data: Schema.optional(Schema.Struct({ issues: Schema.Array(Schema.Unknown) })),
  issues: Schema.optional(Schema.Array(Schema.Unknown)),
});
const NotionSummary = Schema.Struct({
  data: Schema.optional(Schema.Struct({ results: Schema.Array(Schema.Unknown) })),
  results: Schema.optional(Schema.Array(Schema.Unknown)),
});

const summarizeGitHub = (payload: unknown): string | undefined =>
  Option.match(Schema.decodeUnknownOption(GitHubSummary)(payload), {
    onNone: () => undefined,
    onSome: result => {
      const login = result.data?.login ?? result.login;
      return login === undefined ? undefined : `Signed in to GitHub as ${login}.`;
    },
  });

const summarizeCount = (
  payload: unknown,
  decode: (
    input: unknown
  ) => Option.Option<{ readonly values: ReadonlyArray<unknown> | undefined }>,
  format: (count: number) => string
): string | undefined =>
  Option.match(decode(payload), {
    onNone: () => undefined,
    onSome: result => (result.values === undefined ? undefined : format(result.values.length)),
  });

const decodeGmail = (payload: unknown) =>
  Option.map(Schema.decodeUnknownOption(GmailSummary)(payload), result => ({
    values: result.data?.messages ?? result.messages,
  }));
const decodeSlack = (payload: unknown) =>
  Option.map(Schema.decodeUnknownOption(SlackSummary)(payload), result => ({
    values: result.data?.channels ?? result.channels,
  }));
const decodeLinear = (payload: unknown) =>
  Option.map(Schema.decodeUnknownOption(LinearSummary)(payload), result => ({
    values: result.data?.issues ?? result.issues,
  }));
const decodeNotion = (payload: unknown) =>
  Option.map(Schema.decodeUnknownOption(NotionSummary)(payload), result => ({
    values: result.data?.results ?? result.results,
  }));

export const CURATED_ONBOARDING_TASKS: ReadonlyArray<CuratedOnboardingTask> = [
  {
    label: 'Check my GitHub account',
    toolkit: 'github',
    tool: 'GITHUB_GET_THE_AUTHENTICATED_USER',
    args: {},
    summarize: summarizeGitHub,
  },
  {
    label: 'Read my latest emails',
    toolkit: 'gmail',
    tool: 'GMAIL_FETCH_EMAILS',
    args: { max_results: 3, verbose: false },
    summarize: payload =>
      summarizeCount(payload, decodeGmail, count => `Read ${count} message(s) from Gmail.`),
  },
  {
    label: 'List my Slack channels',
    toolkit: 'slack',
    tool: 'SLACK_LIST_ALL_CHANNELS',
    args: { limit: 10 },
    summarize: payload =>
      summarizeCount(payload, decodeSlack, count => `Found ${count} Slack channel(s).`),
  },
  {
    label: 'See my Linear issues',
    toolkit: 'linear',
    tool: 'LINEAR_LIST_LINEAR_ISSUES',
    args: { first: 5 },
    summarize: payload =>
      summarizeCount(payload, decodeLinear, count => `Found ${count} Linear issue(s).`),
  },
  {
    label: 'Search my Notion pages',
    toolkit: 'notion',
    tool: 'NOTION_SEARCH_NOTION_PAGE',
    args: { query: '', page_size: 5 },
    summarize: payload =>
      summarizeCount(payload, decodeNotion, count => `Found ${count} Notion result(s).`),
  },
];

export const curatedToolkitSlugs = (): ReadonlyArray<CuratedToolkit> =>
  CURATED_ONBOARDING_TASKS.map(task => task.toolkit);

export const findCuratedOnboardingTask = (slug: string): Option.Option<CuratedOnboardingTask> => {
  const normalized = slug.trim().toLowerCase();
  return Arr.findFirst(CURATED_ONBOARDING_TASKS, task => task.toolkit === normalized);
};
