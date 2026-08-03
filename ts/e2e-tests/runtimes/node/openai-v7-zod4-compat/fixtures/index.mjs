import { z } from 'zod';
import OpenAI from 'openai';
import { Composio, OpenAIProvider } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';

const schema = z.object({ name: z.string() });
schema.parse({ name: 'OpenAI 7' });
console.log('zod@4 works');

const openai = new OpenAI({ apiKey: 'test-key' });
if (!openai.responses) {
  throw new Error('OpenAI client does not expose the Responses API');
}
console.log('openai@7 works');

const chatProvider = new OpenAIProvider();
const composio = new Composio({
  provider: chatProvider,
  apiKey: 'test-key',
});
if (!composio) {
  throw new Error('Composio client construction failed');
}
console.log('@composio/core works');

const composioTool = {
  slug: 'TEST',
  description: 'Test tool',
  inputParameters: { type: 'object', properties: {} },
};

const chatTool = chatProvider.wrapTool(composioTool);
if (chatTool.type !== 'function' || chatTool.function.name !== 'TEST') {
  throw new Error('Core OpenAI provider returned an invalid tool');
}
console.log('core wrapTool works');

const responsesProvider = new OpenAIResponsesProvider();
const responsesTool = responsesProvider.wrapTool(composioTool);
if (responsesTool.type !== 'function' || responsesTool.name !== 'TEST') {
  throw new Error('Responses provider returned an invalid tool');
}
console.log('responses wrapTool works');

console.log('All packages work together!');
