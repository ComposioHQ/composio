import TOOLS from './tools.json' with { type: 'json' };

export const TOOLS_GITHUB = TOOLS.filter(tool => tool.startsWith('GITHUB_'));
