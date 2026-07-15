/**
 * Tool Router direct_tools session preset with OpenAI Agents
 *
 * `sessionPreset: SessionPreset.DIRECT_TOOLS` is a shortcut for sessions where the full
 * allowed tool set is known upfront. It disables Tool Router meta/helper tools
 * by default and loads all tools allowed by the filters directly into
 * `session.tools()` and the MCP tool list.
 *
 * Usage:
 *   COMPOSIO_API_KEY=... OPENAI_API_KEY=... bun src/direct-tools-preset.ts
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import {
  Composio,
  SessionPreset,
  experimental_createTool,
  experimental_createToolkit,
} from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { Agent, run } from '@openai/agents';
import { z } from 'zod/v3';

function requireEnv(name: 'COMPOSIO_API_KEY' | 'OPENAI_API_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} before running this example.`);
  }
  return value;
}

const composioApiKey = requireEnv('COMPOSIO_API_KEY');
requireEnv('OPENAI_API_KEY');

const composio = new Composio({
  apiKey: composioApiKey,
  baseURL: process.env.COMPOSIO_BASE_URL || undefined,
  provider: new OpenAIAgentsProvider(),
});

const getUserNote = experimental_createTool('GET_USER_NOTE', {
  name: 'Get Hacker News user note',
  description: 'Return an internal research note for a Hacker News username.',
  inputParams: z.object({
    username: z.string().describe('Hacker News username, for example pg'),
  }),
  execute: async ({ username }) => ({
    username,
    note:
      username.toLowerCase() === 'pg'
        ? 'Paul Graham; YC co-founder and essayist.'
        : `No curated internal note for ${username}.`,
  }),
});

const hnResearch = experimental_createToolkit('HN_RESEARCH', {
  name: 'Hacker News research',
  description: 'Internal research notes for Hacker News users.',
  tools: [getUserNote],
});

const session = await composio.create('direct-tools-example-user', {
  sessionPreset: SessionPreset.DIRECT_TOOLS,
  toolkits: ['hackernews'],
  tools: {
    hackernews: {
      enable: ['HACKERNEWS_GET_USER'],
    },
  },
  experimental: {
    customToolkits: [hnResearch],
  },
});

const tools = await session.tools();
const toolNames = tools.map(tool => tool.name);
assert(toolNames.includes('HACKERNEWS_GET_USER'));
assert(toolNames.includes('LOCAL_HN_RESEARCH_GET_USER_NOTE'));
assert(!toolNames.includes('COMPOSIO_SEARCH_TOOLS'));

console.log('Direct tools exposed to the agent:');
for (const tool of tools) {
  console.log(`- ${tool.name}`);
}

const agent = new Agent({
  name: 'Direct Tools Demo Agent',
  instructions: 'Use the provided tools to perform the task.',
  model: process.env.OPENAI_MODEL ?? 'gpt-5.5',
  tools,
});

const prompt =
  process.argv.slice(2).join(' ') ||
  'Look up user "pg" on Hacker News and include any internal research note.';

console.log(`\nUser: ${prompt}\n`);
const result = await run(agent, prompt);
console.log(`Assistant: ${result.finalOutput}`);
