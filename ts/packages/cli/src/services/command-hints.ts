type HintParams = Readonly<Record<string, string | undefined>>;

const getParam = (params: HintParams | undefined, key: string, fallback: string) =>
  params?.[key]?.trim() ? params[key]! : fallback;

export type CommandHintId =
  | 'root.search'
  | 'root.tools.list'
  | 'root.tools.info'
  | 'root.triggers.list'
  | 'root.triggers.info'
  | 'root.execute'
  | 'root.execute.getSchema'
  | 'root.link'
  | 'root.orgs.switch'
  | 'dev.init'
  | 'dev.playgroundExecute'
  | 'dev.playgroundExecute.getSchema'
  | 'dev.logs.tools'
  | 'dev.logs.triggers'
  | 'dev.orgs.switch'
  | 'dev.projects.list'
  | 'dev.toolkits.list'
  | 'dev.connectedAccounts.link'
  | 'dev.authConfigs.list';

type CommandHintNode = {
  readonly example: (params?: HintParams) => string;
  readonly links?: ReadonlyArray<CommandHintId>;
};

export const COMMAND_HINTS: Record<CommandHintId, CommandHintNode> = {
  'root.search': {
    example: params => `composio search "${getParam(params, 'query', '<query>')}"`,
    links: ['root.execute', 'root.link', 'root.tools.list'],
  },
  'root.tools.list': {
    example: params => `composio tools list "${getParam(params, 'toolkit', '<toolkit>')}"`,
    links: ['root.tools.info', 'root.execute'],
  },
  'root.tools.info': {
    example: params => `composio tools info "${getParam(params, 'slug', '<slug>')}"`,
    links: ['root.execute.getSchema', 'root.execute'],
  },
  'root.triggers.list': {
    example: params => `composio triggers list "${getParam(params, 'toolkit', '<toolkit>')}"`,
    links: ['root.triggers.info'],
  },
  'root.triggers.info': {
    example: params => `composio triggers info "${getParam(params, 'slug', '<slug>')}"`,
    links: ['root.triggers.list'],
  },
  'root.execute': {
    example: params =>
      `composio execute "${getParam(params, 'slug', '<slug>')}" ${getParam(params, 'data', "-d '{}'")}`.trim(),
    links: ['root.link', 'root.execute.getSchema'],
  },
  'root.execute.getSchema': {
    example: params => `composio execute "${getParam(params, 'slug', '<slug>')}" --get-schema`,
    links: ['root.execute', 'root.tools.info'],
  },
  'root.link': {
    example: params => `composio link ${getParam(params, 'toolkit', '<toolkit>')}`,
    links: ['root.execute'],
  },
  'root.orgs.switch': {
    example: () => 'composio orgs switch',
    links: ['root.execute'],
  },
  'dev.init': {
    example: () => 'composio dev init',
    links: ['dev.playgroundExecute', 'dev.logs.tools', 'dev.logs.triggers'],
  },
  'dev.playgroundExecute': {
    example: params =>
      `composio dev playground-execute "${getParam(params, 'slug', '<slug>')}" --user-id "${getParam(params, 'userId', '<user-id>')}" ${getParam(params, 'data', "-d '{}'")}`.trim(),
    links: ['dev.connectedAccounts.link', 'dev.init', 'dev.playgroundExecute.getSchema'],
  },
  'dev.playgroundExecute.getSchema': {
    example: params =>
      `composio dev playground-execute "${getParam(params, 'slug', '<slug>')}" --get-schema`,
    links: ['dev.playgroundExecute'],
  },
  'dev.logs.tools': {
    example: params => `composio dev logs tools "${getParam(params, 'logId', '<log_id>')}"`,
  },
  'dev.logs.triggers': {
    example: params => `composio dev logs triggers "${getParam(params, 'logId', '<log_id>')}"`,
  },
  'dev.orgs.switch': {
    example: () => 'composio dev orgs switch',
    links: ['dev.init', 'dev.projects.list'],
  },
  'dev.projects.list': {
    example: () => 'composio dev projects list',
    links: ['dev.init'],
  },
  'dev.toolkits.list': {
    example: () => 'composio dev toolkits list',
    links: ['root.tools.list', 'dev.connectedAccounts.link'],
  },
  'dev.connectedAccounts.link': {
    example: params =>
      `composio dev connected-accounts link ${getParam(params, 'toolkit', '<toolkit>')} --user-id "${getParam(params, 'userId', '<user-id>')}"`,
    links: ['dev.playgroundExecute'],
  },
  'dev.authConfigs.list': {
    example: () => 'composio dev auth-configs list',
    links: ['dev.connectedAccounts.link'],
  },
};

export const commandHintExample = (id: CommandHintId, params?: HintParams): string =>
  COMMAND_HINTS[id].example(params);

export const commandHintStep = (label: string, id: CommandHintId, params?: HintParams): string =>
  `${label}:\n> ${commandHintExample(id, params)}`;

export const commandHintLinks = (id: CommandHintId): ReadonlyArray<CommandHintId> =>
  COMMAND_HINTS[id].links ?? [];

export const renderCommandHintGraph = () => ({
  nodes: (Object.keys(COMMAND_HINTS) as CommandHintId[]).map(id => ({
    id,
    example: commandHintExample(id),
    links: [...commandHintLinks(id)],
  })),
});
