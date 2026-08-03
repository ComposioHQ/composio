/**
 * Simple test script to verify @composio/core works with openai@7 and zod@4
 *
 * This test verifies that the packages can be imported and instantiated together
 * without peer dependency conflicts. It doesn't make actual API calls.
 *
 * @see https://github.com/ComposioHQ/composio/issues/2336
 */
import { z } from 'zod';
import OpenAI from 'openai';
import { Composio, OpenAIProvider } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';

// Verify zod@4 works
const schema = z.object({ name: z.string() });
schema.parse({ name: 'OpenAI 7' });
console.log('✅ zod@4 works');

// Verify openai@7 works without making a network request.
const openai = new OpenAI({ apiKey: 'test-key' });
if (!openai.responses) {
  throw new Error('OpenAI client does not expose the Responses API');
}
console.log('✅ openai@7 works');

// Verify @composio/core works
const provider = new OpenAIProvider();
const composio = new Composio({
  provider,
  apiKey: 'test-key',
});
if (!composio) {
  throw new Error('Composio client construction failed');
}
console.log('✅ @composio/core works');

const composioTool = {
  slug: 'TEST',
  description: 'Test tool',
  inputParameters: { type: 'object', properties: {} },
};

// Verify both published provider surfaces wrap tools without API calls.
const chatTool = provider.wrapTool(composioTool);
if (chatTool.type !== 'function' || chatTool.function.name !== 'TEST') {
  throw new Error('Core OpenAI provider returned an invalid tool');
}
console.log('✅ core wrapTool works');

const responsesProvider = new OpenAIResponsesProvider();
const responsesTool = responsesProvider.wrapTool(composioTool);
if (responsesTool.type !== 'function' || responsesTool.name !== 'TEST') {
  throw new Error('Responses provider returned an invalid tool');
}
console.log('✅ responses wrapTool works');

console.log('\n🎉 All packages work together!');
process.exit(0);
