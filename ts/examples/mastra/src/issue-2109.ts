import { Agent } from '@mastra/core/agent';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';

const retrievalInstructions = `You are a helpful assistant that can use the Composio tools to retrieve information from Gmail.
You should limit the response to a single email only.
`

type ComposioInstance = InstanceType<typeof Composio>;
type ListReturn = Awaited<ReturnType<ComposioInstance['connectedAccounts']['list']>>;

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

const activeAccount = (await composio.connectedAccounts.list()).items[0];

type RuntimeContextType = {
  userId: string;
  activeAccount: ListReturn['items'][number];
};

const runtimeContext = new RuntimeContext<RuntimeContextType>();
runtimeContext.set('userId', process.env.COMPOSIO_MCP_CONFIG_USER_ID!);
runtimeContext.set('activeAccount', activeAccount);

export const retrievalAgent = new Agent({
  name: 'Retrieval',
  id: 'retrieval-agent',
  description:
    'The Retrieval agent retrieves information from the database using semantic layer context.',
  instructions: retrievalInstructions,
  model: openai('gpt-4.1-mini'),
  tools: async ({ runtimeContext }) => {
    // retrieve userId and activeAccount from the runtimeContext
    const userId = runtimeContext.get('userId') as RuntimeContextType['userId'];

    const activeAccount = runtimeContext.get('activeAccount') as RuntimeContextType['activeAccount'];

    // fetch composio tools and dynamically use them in the agent
    const composioTools = await composio.tools.get(userId, {
      toolkits: [activeAccount.toolkit.slug],
    });

    return composioTools;
  },
});

/**
 * Generate a response from the agent
 */
const { text } = await retrievalAgent.generate(
  [{ role: 'user', content: 'Give me a summary of the latest email from my Gmail account' }],
  {
    runtimeContext,
  },
);

console.log('\n🤖 Agent Response:\n');
console.log(text);

