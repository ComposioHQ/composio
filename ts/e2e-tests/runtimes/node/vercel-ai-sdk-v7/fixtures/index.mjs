import { VercelProvider } from '@composio/vercel';

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
};

const calls = [];
const executeTool = async (slug, params) => {
  calls.push({ slug, params });
  return {
    data: { slug, params },
    error: null,
    successful: true,
  };
};

const provider = new VercelProvider();
const wrapped = provider.wrapTool(composioTool, executeTool);

if (!wrapped || !wrapped.inputSchema || typeof wrapped.execute !== 'function') {
  throw new Error('Wrapped tool does not match the AI SDK tool shape');
}
console.log('WRAPPED_TOOL_INPUT_SCHEMA_OK');

await wrapped.execute({ query: 'object input' });
if (calls.at(-1)?.slug !== 'TEST_TOOL' || calls.at(-1)?.params?.query !== 'object input') {
  throw new Error('Object input was not forwarded to executeTool');
}
console.log('OBJECT_INPUT_EXECUTION_OK');

await wrapped.execute(JSON.stringify({ query: 'string input' }));
if (calls.at(-1)?.slug !== 'TEST_TOOL' || calls.at(-1)?.params?.query !== 'string input') {
  throw new Error('String input was not normalized before executeTool');
}
console.log('STRING_INPUT_EXECUTION_OK');

await wrapped.execute(
  { query: 'options input' },
  {
    toolCallId: 'call_1',
    messages: [],
    context: {},
  }
);
if (calls.at(-1)?.slug !== 'TEST_TOOL' || calls.at(-1)?.params?.query !== 'options input') {
  throw new Error('AI SDK v7 execution options were not accepted');
}
console.log('V7_EXECUTION_OPTIONS_OK');

const toolSet = provider.wrapTools([composioTool], executeTool);
if (!toolSet.TEST_TOOL) {
  throw new Error('Wrapped tools collection is missing TEST_TOOL');
}
console.log('TOOL_SET_OK');
