import { VercelProvider, type VercelToolCollection } from '@composio/vercel';
import type { Tool as ComposioTool, ExecuteToolFn } from '@composio/core';
import type { ToolSet } from 'ai';

const composioTool = {
  slug: 'TEST_TOOL',
  name: 'Test Tool',
  description: 'A tool used by the AI SDK compatibility fixture',
  version: '20260625_00',
  availableVersions: ['20260625_00'],
  inputParameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Query text',
      },
    },
    required: ['query'],
  },
  tags: [],
} satisfies ComposioTool;

const executeTool = (async () => ({
  data: { ok: true },
  error: null,
  successful: true,
})) satisfies ExecuteToolFn;

const provider = new VercelProvider();
const tools = provider.wrapTools([composioTool], executeTool);

// Assignability smoke check: the wrapped collection must satisfy both the
// provider's exported type and the installed AI SDK's ToolSet.
const _wrappedToolSet: VercelToolCollection = tools satisfies ToolSet;
