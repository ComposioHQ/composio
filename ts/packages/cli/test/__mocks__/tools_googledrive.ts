import TOOLS from './tools.json' with { type: 'json' };

export const TOOLS_GOOGLEDRIVE = TOOLS.filter(tool => tool.startsWith('GOOGLEDRIVE_'));
