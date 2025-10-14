import TOOLS from './tools-as-enums.json' with { type: 'json' };

export const TOOLS_GMAIL = TOOLS.filter(tool => tool.startsWith('GMAIL_'));
