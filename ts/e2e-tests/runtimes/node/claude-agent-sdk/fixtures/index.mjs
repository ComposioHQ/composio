import { ClaudeAgentSDKProvider } from '@composio/claude-agent-sdk';
import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';

const TOOL_SLUG = 'COMPOSIO_E2E_SENTINEL';
const SENTINEL = 'COMPOSIO_CLAUDE_AGENT_SDK_NODE_CURRENT_OK';

const provider = new ClaudeAgentSDKProvider();
const calls = [];

const tools = provider.wrapTools(
  [
    {
      slug: TOOL_SLUG,
      name: 'Composio E2E Sentinel',
      description:
        'Returns the exact Composio Claude Agent SDK e2e sentinel. Use this tool when asked for the sentinel.',
      version: 'e2e',
      availableVersions: ['e2e'],
      inputParameters: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            enum: ['node-current'],
            description: 'The e2e runtime label.',
          },
          shout: {
            type: 'boolean',
            description: 'Whether to return the uppercase sentinel.',
            default: true,
          },
        },
        required: ['label'],
        additionalProperties: false,
      },
      tags: ['e2e'],
    },
  ],
  async (toolSlug, input) => {
    calls.push({ toolSlug, input });

    if (toolSlug !== TOOL_SLUG) {
      throw new Error(`Unexpected tool slug: ${toolSlug}`);
    }
    if (input.label !== 'node-current') {
      throw new Error(`Unexpected label: ${JSON.stringify(input.label)}`);
    }

    return input.shout === false ? SENTINEL.toLowerCase() : SENTINEL;
  }
);

if (tools.length !== 1) {
  throw new Error(`Expected exactly one wrapped tool, got ${tools.length}`);
}

const mcpServer = createSdkMcpServer({
  name: 'composio',
  version: '1.0.0',
  tools,
});

let queryResult = '';

for await (const message of query({
  prompt: [
    `Use the ${TOOL_SLUG} tool with label "node-current" and shout true.`,
    `Reply with exactly the tool result: ${SENTINEL}`,
    'Do not use any built-in tools.',
  ].join('\n'),
  options: {
    mcpServers: { composio: mcpServer },
    tools: [],
    allowedTools: [`mcp__composio__${TOOL_SLUG}`],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    maxTurns: 4,
    maxBudgetUsd: 0.25,
    persistSession: false,
    settingSources: [],
  },
})) {
  if (message.type === 'result') {
    if (message.subtype !== 'success') {
      throw new Error(`Claude query failed: ${JSON.stringify(message.errors ?? message)}`);
    }
    queryResult = message.result;
  }
}

const sdkCalls = calls.filter(call => call.toolSlug === TOOL_SLUG);

if (sdkCalls.length < 1) {
  throw new Error(`Expected Claude Agent SDK to call ${TOOL_SLUG}, got ${sdkCalls.length} calls`);
}

if (!queryResult.includes(SENTINEL)) {
  throw new Error(`Expected query result to include ${SENTINEL}, got ${JSON.stringify(queryResult)}`);
}

console.log('claude query executed wrapped tool');
