import TOOLS from './tools-as-enums.json' with { type: 'json' };

export const TOOLS_GITHUB = TOOLS.filter(tool => tool.startsWith('GITHUB_'));
