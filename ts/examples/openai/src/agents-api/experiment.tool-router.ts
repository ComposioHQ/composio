import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { hostedMcpTool, Agent as OpenAIAgent, run } from '@openai/agents';
import type { HostedMCPTool } from '@openai/agents';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIAgentsProvider(),
  allowTracking: false,
});

const externalUserId = 'default';

// 2. Create a tool router session.
// HACKERNEWS is unauthenticated, so it works with the repository's shared
// staging key without requiring a connected Gmail or GitHub account.
const session = await composio.sessions.create(externalUserId, {
  toolkits: ['hackernews'],
  mcp: true,
});

// 3. Retrieve the MCP server instance for the tool router

const tools: HostedMCPTool[] = [
  hostedMcpTool({
    serverLabel: 'composio tool router',
    serverUrl: session.mcp.url,
    requireApproval: {
      never: {
        toolNames: ['HACKERNEWS_GET_USER_BY_USERNAME'],
      },
    },
  }),
];

// 4. Pass tools to OpenAI-specific Agent.
const agent = new OpenAIAgent({
  name: 'HackerNews Assistant',
  instructions: `
    You are a helpful HackerNews assistant that looks up user profiles.
    Be concise and summarize the user's HackerNews profile clearly.
  `,
  model: 'gpt-4o-mini',
  tools: tools,
});

// 5. Execute the OpenAI-specific agent.
// Fetch a HackerNews user profile.
console.log('\n=== Fetching HackerNews User Profile ===');
const response = await run(
  agent,
  'Look up the HackerNews user `pg` and summarize their profile.'
);
console.log('\n📰 HackerNews Profile:');

const output = response.output.filter(({ type }) => type === 'message').at(0);

// @ts-ignore
console.log(output?.content[0].text);
