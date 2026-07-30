export type OnboardDemoKind = 'read' | 'reversible_create';

export type OnboardExecuteSummarizer = (data: Record<string, unknown>) => string | undefined;

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asArray = (value: unknown): ReadonlyArray<unknown> | undefined =>
  Array.isArray(value) ? value : undefined;

const findList = (
  data: Record<string, unknown>,
  keys: ReadonlyArray<string>
): ReadonlyArray<unknown> | undefined => {
  const d = { ...data, ...asRecord(data.data) };
  for (const key of keys) {
    const direct = asArray(d[key]);
    if (direct) return direct;
    const nested = asRecord(d[key]);
    const nodes = asArray(nested.nodes) ?? asArray(nested.results);
    if (nodes) return nodes;
  }
  return undefined;
};

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export interface OnboardTaskDemo {
  readonly kind: OnboardDemoKind;
  readonly toolSlugHint: string;
  readonly sampleArgs: Readonly<Record<string, unknown>>;
  readonly summarize?: OnboardExecuteSummarizer;
}

export interface OnboardFollowUpCreateArg {
  readonly key: string;
  readonly prompt: string;
  readonly placeholder?: string;
}

export interface OnboardFollowUpCreate {
  readonly kind: 'reversible_create';
  readonly label: string;
  readonly toolSlugHint: string;
  readonly requiredArgs: ReadonlyArray<OnboardFollowUpCreateArg>;
  readonly fixedArgs?: Readonly<Record<string, unknown>>;
  readonly summarize?: OnboardExecuteSummarizer;
}

export interface OnboardTask {
  readonly id: string;
  readonly label: string;
  readonly toolkit: string;
  readonly authType: 'oauth';
  readonly searchQuery: string;
  readonly demo: OnboardTaskDemo;
  readonly followUpCreate?: OnboardFollowUpCreate;
}

export const ONBOARD_TASKS: ReadonlyArray<OnboardTask> = [
  {
    id: 'github_profile',
    label: 'GitHub — fetch my profile',
    toolkit: 'github',
    authType: 'oauth',
    searchQuery: 'get my github profile',
    demo: {
      kind: 'read',
      toolSlugHint: 'GITHUB_GET_THE_AUTHENTICATED_USER',
      sampleArgs: {},
      summarize: data => {
        const d = { ...data, ...asRecord(data.data) };
        const login = str(d.login);
        const name = str(d.name);
        return login ? `You're @${login}${name ? ` (${name})` : ''}` : undefined;
      },
    },
    followUpCreate: {
      kind: 'reversible_create',
      label: 'a test GitHub issue you can close right after',
      toolSlugHint: 'GITHUB_CREATE_AN_ISSUE',
      requiredArgs: [
        { key: 'owner', prompt: 'Repository owner (user or org)', placeholder: 'e.g. composiohq' },
        { key: 'repo', prompt: 'Repository name', placeholder: 'e.g. composio' },
        {
          key: 'title',
          prompt: 'Issue title',
          placeholder: 'e.g. Test issue from composio onboard',
        },
      ],
      summarize: data => {
        const d = { ...data, ...asRecord(data.data) };
        const number = typeof d.number === 'number' ? d.number : undefined;
        const title = str(d.title);
        const url = str(d.html_url);
        if (number === undefined) return undefined;
        return `Created issue #${number}${title ? ` '${title}'` : ''}${url ? ` → ${url}` : ''}`;
      },
    },
  },
  {
    id: 'gmail_read_latest',
    label: 'Gmail — read my latest emails',
    toolkit: 'gmail',
    authType: 'oauth',
    searchQuery: 'read my latest emails',
    demo: {
      kind: 'read',
      toolSlugHint: 'GMAIL_FETCH_EMAILS',
      sampleArgs: { max_results: 3, verbose: false },
      summarize: data => {
        const list = findList(data, ['messages', 'emails', 'threads', 'items']);
        if (!list) return undefined;
        const first = asRecord(list[0]);
        const subject = str(first.subject) ?? str(asRecord(first.payload).subject);
        return `Fetched ${plural(list.length, 'email')}${subject ? ` (latest: '${subject}')` : ''}`;
      },
    },
  },
  {
    id: 'slack_list_channels',
    label: 'Slack — list my channels',
    toolkit: 'slack',
    authType: 'oauth',
    searchQuery: 'list slack channels',
    demo: {
      kind: 'read',
      toolSlugHint: 'SLACK_LIST_ALL_CHANNELS',
      sampleArgs: { limit: 10 },
      summarize: data => {
        const list = findList(data, ['channels', 'items']);
        return list ? plural(list.length, 'channel') : undefined;
      },
    },
  },
  {
    id: 'linear_my_issues',
    label: 'Linear — list my issues',
    toolkit: 'linear',
    authType: 'oauth',
    searchQuery: 'list my linear issues',
    demo: {
      kind: 'read',
      toolSlugHint: 'LINEAR_LIST_LINEAR_ISSUES',
      sampleArgs: { first: 5 },
      summarize: data => {
        const list = findList(data, ['issues', 'nodes', 'items']);
        return list ? `${plural(list.length, 'issue')} assigned` : undefined;
      },
    },
    followUpCreate: {
      kind: 'reversible_create',
      label: 'a test Linear issue you can archive right after',
      toolSlugHint: 'LINEAR_CREATE_LINEAR_ISSUE',
      requiredArgs: [
        {
          key: 'team_id',
          prompt: 'Linear team ID',
          placeholder: 'the team UUID from Linear settings',
        },
        {
          key: 'title',
          prompt: 'Issue title',
          placeholder: 'e.g. Test issue from composio onboard',
        },
      ],
    },
  },
  {
    id: 'notion_search_pages',
    label: 'Notion — search my pages',
    toolkit: 'notion',
    authType: 'oauth',
    searchQuery: 'search notion pages',
    demo: {
      kind: 'read',
      toolSlugHint: 'NOTION_SEARCH_NOTION_PAGE',
      sampleArgs: { query: '', page_size: 5 },
      summarize: data => {
        const list = findList(data, ['results', 'pages', 'items']);
        return list ? plural(list.length, 'page') : undefined;
      },
    },
  },
];

const normalizeToolkit = (slug: string): string => slug.trim().toLowerCase();

export const findOnboardTaskByToolkit = (toolkitSlug: string): OnboardTask | undefined =>
  ONBOARD_TASKS.find(task => task.toolkit === normalizeToolkit(toolkitSlug));

const tokenize = (text: string): ReadonlySet<string> =>
  new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);

export const matchOnboardTask = (text: string): OnboardTask | undefined => {
  const tokens = tokenize(text);
  if (tokens.size === 0) return undefined;
  return ONBOARD_TASKS.find(task => tokens.has(task.toolkit));
};

export const findOnboardTaskForConnectedToolkits = (
  connectedToolkits: ReadonlyArray<string>
): OnboardTask | undefined => {
  const connected = new Set(connectedToolkits.map(normalizeToolkit));
  return ONBOARD_TASKS.find(task => connected.has(task.toolkit));
};
