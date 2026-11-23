import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { Composio } from '@composio/core';
import { Agent, run } from '@openai/agents';

const composio = new Composio({
  provider: new OpenAIAgentsProvider({
    strict: true,
  }),
});

console.log(`🔄 Fetching tools from composio...`);
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER', {
  beforeExecute: async ({ toolSlug, toolkitSlug, params }) => {
    console.log(`🔄 Executing tool ${toolSlug} from toolkit ${toolkitSlug}...`);
    return params;
  },
  afterExecute: async ({ toolSlug, result }) => {
    console.log(`✅ Tool ${toolSlug} executed`);
    return result;
  },
});

console.log(`✅ Tools fetched from composio`);

const agent = new Agent({
  name: 'Hackernews assistant',
  tools: tools,
});

console.log(`🔄 Running agent...`);
const result = await run(agent, 'Tell me about the user `pg` in hackernews');
console.log(`✅ Received response from agent`);
if (result.finalOutput) {
  console.log(JSON.stringify(result.finalOutput, null, 2));
}
