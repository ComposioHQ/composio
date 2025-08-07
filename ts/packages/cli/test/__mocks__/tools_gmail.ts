import TOOLS from './tools.json' with { type: 'json' };

export const TOOLS_GMAIL = TOOLS.filter(tool => tool.startsWith('GMAIL_'));
