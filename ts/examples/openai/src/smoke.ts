/**
 * Deterministic smoke test for the OpenAI example.
 *
 * Exercises direct provider wrapping and Tool Router session wrapping against
 * a real backend without making an LLM request. It needs only
 * COMPOSIO_API_KEY and skips cleanly when that key is absent.
 *
 * Run: bun ts/examples/openai/src/smoke.ts
 */
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import type OpenAI from 'openai';
import 'dotenv/config';

const TOOLKIT = 'hackernews';
const USER_ID = 'examples-smoke';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`SMOKE FAIL: ${message}`);
  }
}

function assertJsonSerializable(value: unknown, source: string): void {
  try {
    JSON.stringify(value);
  } catch {
    throw new Error(`SMOKE FAIL: ${source} is not JSON-serializable`);
  }
}

function assertOpenAITools(
  tools: unknown,
  source: string
): asserts tools is OpenAI.ChatCompletionTool[] {
  assert(Array.isArray(tools), `${source} did not return an array`);
  assert(tools.length > 0, `${source} returned 0 tools`);

  for (const tool of tools) {
    assert(tool.type === 'function', `${source} returned a non-function tool`);
    assert(tool.function.name.length > 0, `${source} returned a tool without a name`);
    assert(tool.function.parameters != null, `${source} tool ${tool.function.name} has no schema`);
    assertJsonSerializable(tool.function.parameters, `${source} tool ${tool.function.name} schema`);
  }
}

if (!process.env.COMPOSIO_API_KEY) {
  console.log('⏭️  COMPOSIO_API_KEY not set — skipping OpenAI smoke.');
  process.exit(0);
}

console.log(`Backend: ${process.env.COMPOSIO_BASE_URL ?? '(default/production)'}`);

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),
});

const wrapped = await composio.tools.get(USER_ID, { toolkits: [TOOLKIT] });
assertOpenAITools(wrapped, 'openai direct wrapping');
console.log(`  ✓ direct wrapping: ${wrapped.length} tools`);

const session = await composio.sessions.create(USER_ID, { toolkits: [TOOLKIT] });
const sessionTools = await session.tools();
assertOpenAITools(sessionTools, 'openai session.tools()');
console.log(`  ✓ tool-router session: ${sessionTools.length} tools`);

console.log('\n✅ OpenAI smoke passed.');
