import { z } from 'zod/v3';
import type { LocalToolkitDeclaration } from '../types';

const all = ['all'] as const;

const chromeDevtoolsServer = {
  command: process.env.COMPOSIO_CHROME_DEVTOOLS_MCP_COMMAND ?? 'npx',
  args: process.env.COMPOSIO_CHROME_DEVTOOLS_MCP_COMMAND
    ? []
    : ['-y', 'chrome-devtools-mcp@latest', '--autoConnect'],
};

export const chromeDevtoolsToolkit: LocalToolkitDeclaration = {
  slug: 'CHROME_DEVTOOLS',
  name: 'Chrome DevTools MCP',
  description:
    'Local Chrome/CDP automation through chrome-devtools-mcp@latest --autoConnect. Requires Node/npm and a reachable Chrome instance.',
  platforms: all,
  source: {
    type: 'mcp',
    package: 'chrome-devtools-mcp@latest',
    command: 'npx -y chrome-devtools-mcp@latest --autoConnect',
  },
  tools: [
    {
      slug: 'LIST_TOOLS',
      name: 'List Chrome DevTools MCP Tools',
      description:
        'Start chrome-devtools-mcp and list the MCP tools available for Chrome/CDP automation.',
      platforms: all,
      inputParams: z.object({}),
      execution: {
        kind: 'mcp',
        server: chromeDevtoolsServer,
      },
    },
    {
      slug: 'CALL_TOOL',
      name: 'Call Chrome DevTools MCP Tool',
      description:
        'Call any tool exposed by chrome-devtools-mcp. Use LIST_TOOLS first when you need exact MCP tool names and input shapes.',
      platforms: all,
      inputParams: z.object({
        toolName: z.string().describe('MCP tool name to call, for example navigate_page or evaluate_script.'),
        arguments: z.record(z.unknown()).default({}).describe('Arguments for the selected MCP tool.'),
      }),
      execution: {
        kind: 'mcp',
        server: chromeDevtoolsServer,
        toolName: input => (typeof input.toolName === 'string' ? input.toolName : undefined),
        arguments: input =>
          input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments)
            ? (input.arguments as Record<string, unknown>)
            : {},
      },
    },
  ],
};
