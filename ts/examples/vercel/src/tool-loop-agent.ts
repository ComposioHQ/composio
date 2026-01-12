import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

/**
 * This example demonstrates the new ToolLoopAgent class introduced in AI SDK v6,
 * which provides a production-ready implementation that handles the complete
 * tool execution loop automatically.
 * 
 * See: https://vercel.com/blog/ai-sdk-6#toolloopagent.
 */

// 1. Initialize Composio with the Vercel provider
const composio = new Composio({
  provider: new VercelProvider(),
});

// 2. Get Composio tools for the agent
console.log('🔄 Fetching Composio tools...');
const tools = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_USER', {
  beforeExecute: ({ params, toolSlug }) => {
    console.log(`🔧 Executing ${toolSlug}...`);
    return params;
  },
  afterExecute: ({ result, toolSlug }) => {
    console.log(`✅ ${toolSlug} completed`);
    return result;
  },
});
console.log(`✅ Tools loaded: ${Object.keys(tools).join(', ')}`);

// 3. Create a ToolLoopAgent with Composio tools
const hackerNewsAgent = new ToolLoopAgent({
  model: openai('gpt-4o-mini'),
  instructions: `You are a helpful assistant that can look up information about Hacker News users.
When asked about a user, use the available tools to fetch their profile information.
Provide a concise summary of the user's profile including their karma, about section, and any other relevant details.`,
  tools,
});

// 4. Run the agent
console.log('🤖 Running agent...\n');
const result = await hackerNewsAgent.generate({
  prompt: 'Who is the user "pg" on Hacker News? Tell me about their profile.',
});

// 5. Display the result
console.log('📝 Agent Response:');
console.log(result.text);
