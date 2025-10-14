import TOOLS from './tools-as-enums.json' with { type: 'json' };

export const TOOLS_GOOGLEDRIVE = TOOLS.filter(tool => tool.startsWith('GOOGLEDRIVE_'));
