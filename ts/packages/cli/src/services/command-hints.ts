type HintParams = Readonly<Record<string, string | undefined>>;

const getParam = (params: HintParams | undefined, key: string, fallback: string) =>
  params?.[key]?.trim() ? params[key]! : fallback;

export type CommandHintId =
  | 'root.search'
  | 'root.tools.list'
  | 'root.tools.info'
  | 'root.execute'
  | 'root.execute.getSchema'
  | 'root.link'
  | 'dev.init'
  | 'dev.execute'
  | 'dev.execute.getSchema'
  | 'dev.logs.tools'
  | 'dev.logs.triggers'
  | 'manage.orgs.switch'
  | 'manage.projects.list'
  | 'manage.toolkits.list'
  | 'manage.connectedAccounts.link'
  | 'manage.authConfigs.list';

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
  'dev.init': {
    example: () => 'composio dev init',
    links: ['dev.execute', 'dev.logs.tools', 'dev.logs.triggers'],
  },
  'dev.execute': {
    example: params =>
      `composio dev execute "${getParam(params, 'slug', '<slug>')}" --user-id "${getParam(params, 'userId', '<user-id>')}" ${getParam(params, 'data', "-d '{}'")}`.trim(),
    links: ['manage.connectedAccounts.link', 'dev.init', 'dev.execute.getSchema'],
  },
  'dev.execute.getSchema': {
    example: params =>
      `composio dev execute "${getParam(params, 'slug', '<slug>')}" --get-schema`,
    links: ['dev.execute'],
  },
  'dev.logs.tools': {
    example: params =>
      `composio dev logs tools "${getParam(params, 'logId', '<log_id>')}"`,
  },
  'dev.logs.triggers': {
    example: params =>
      `composio dev logs triggers "${getParam(params, 'logId', '<log_id>')}"`,
  },
  'manage.orgs.switch': {
    example: () => 'composio manage orgs switch',
    links: ['dev.init', 'manage.projects.list'],
  },
  'manage.projects.list': {
    example: () => 'composio manage projects list',
    links: ['dev.init'],
  },
  'manage.toolkits.list': {
    example: () => 'composio manage toolkits list',
    links: ['root.tools.list', 'manage.connectedAccounts.link'],
  },
  'manage.connectedAccounts.link': {
    example: params =>
      `composio manage connected-accounts link ${getParam(params, 'toolkit', '<toolkit>')} --user-id "${getParam(params, 'userId', '<user-id>')}"`,
    links: ['dev.execute'],
  },
  'manage.authConfigs.list': {
    example: () => 'composio manage auth-configs list',
    links: ['manage.connectedAccounts.link'],
  },
};

export const commandHintExample = (id: CommandHintId, params?: HintParams): string =>
  COMMAND_HINTS[id].example(params);

export const commandHintStep = (
  label: string,
  id: CommandHintId,
  params?: HintParams
): string => `${label}:\n> ${commandHintExample(id, params)}`;

export const commandHintLinks = (id: CommandHintId): ReadonlyArray<CommandHintId> =>
  COMMAND_HINTS[id].links ?? [];

export const renderCommandHintGraph = () => ({
  nodes: (Object.keys(COMMAND_HINTS) as CommandHintId[]).map(id => ({
    id,
    example: commandHintExample(id),
    links: [...commandHintLinks(id)],
  })),
});
