/**
 * Simple test script to verify @composio/core works with openai@5 and zod@4
 */
import { z } from 'zod';
import OpenAI from 'openai';
import { Composio, OpenAIProvider } from '@composio/core';

// Parse and validate environment variables
const EnvSchema = z.object({
  COMPOSIO_API_KEY: z.string().min(1, 'COMPOSIO_API_KEY is required'),
});

const env = EnvSchema.parse(process.env);

// Verify zod@4 works
const schema = z.object({ name: z.string() });
console.log('✅ zod@4 works');

// Verify openai@5 works
const openai = new OpenAI({ apiKey: 'test-key' });
console.log('✅ openai@5 works');

// Verify @composio/core works with API key from env
const provider = new OpenAIProvider();
const composio = new Composio({
  provider,
  apiKey: env.COMPOSIO_API_KEY,
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
