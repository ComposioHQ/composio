export const AGENT_HOSTS = ['claude', 'codex'] as const;

export type AgentHost = (typeof AGENT_HOSTS)[number];

export const AGENT_HOST_LABELS: Readonly<Record<AgentHost, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export const COMPOSIO_AGENT_PLUGIN_ID = 'composio@composio';
