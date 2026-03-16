/**
 * Simple test script to verify @composio/core works with openai@6 and zod@4
 *
 * This test verifies that the packages can be imported and instantiated together
 * without peer dependency conflicts. It doesn't make actual API calls.
 *
 * @see https://github.com/ComposioHQ/composio/issues/2336
 */
import { z } from 'zod';
import OpenAI from 'openai';
import { Composio, OpenAIProvider } from '@composio/core';

// Verify zod@4 works
const schema = z.object({ name: z.string() });
console.log('✅ zod@4 works');

// Verify openai@6 works (note: the package says openai@5 in comments but uses ^6.16.0)
const openai = new OpenAI({ apiKey: 'test-key' });
console.log('✅ openai@5 works');

// Verify @composio/core works
const provider = new OpenAIProvider();
const composio = new Composio({
  provider,
  apiKey: process.env.COMPOSIO_API_KEY,
});
console.log('✅ @composio/core works');

// Verify wrapTool works
const _tool = provider.wrapTool({
  slug: 'TEST',
  description: 'Test tool',
  inputParameters: { type: 'object', properties: {} }
});
console.log('✅ wrapTool works');

console.log('\n🎉 All packages work together!');
process.exit(0);
