import OpenAI from 'openai';
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';

const openai = new OpenAI();
const composio = new Composio({
  provider: new OpenAIResponsesProvider(),
});

console.log(`🔄 Fetching tools from composio...`);
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
console.log(`✅ Tools fetched from composio`);

console.log(`🔄 Generating response from OpenAI...`);
const initialResponse = await openai.responses.create({
  model: 'gpt-4.1',
  input: 'Tell me about the user `pg` in hackernews',
  tools,
});
console.log(`✅ Response generated from OpenAI`);
console.log(JSON.stringify(initialResponse.output, null, 2));

console.log(`🔄 Handling tool calls from response...`);
const modelInputs = await composio.provider.handleResponse(
  'default',
  initialResponse,
  {},
  {
    beforeExecute: async ({ toolSlug, toolkitSlug, params }) => {
      console.log(`🔄 Executing tool ${toolSlug} from toolkit ${toolkitSlug}...`);
      return params;
    },
    afterExecute: async ({ toolSlug, toolkitSlug, result }) => {
      console.log(`✅ Tool ${toolSlug} executed`);
      return result;
    },
  }
);

console.log(`🔄 Submitting tool outputs to OpenAI...`);
console.log(JSON.stringify(modelInputs, null, 2));
const finalResponse = await openai.responses.create({
  model: 'gpt-4.1',
  previous_response_id: initialResponse.id,
  input: modelInputs,
  tools,
});

console.log(`✅ Tool outputs submitted to OpenAI`);
const finalContent = finalResponse.output[0];
if (finalContent.type === 'message' && finalContent.content[0].type === 'output_text') {
  console.log(`🤖 OpenAI response`, finalContent.content[0].text);
} else {
  console.error(`❌ Unexpected response from OpenAI`);
  console.log(JSON.stringify(finalResponse.output, null, 2));
}
