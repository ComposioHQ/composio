/**
 * Tool Router preload with OpenAI Agents
 *
 * Shows direct tool exposure for:
 * 1. Composio tools via `preload.tools`
 * 2. SDK custom tools via `preload: true` on the custom tool or toolkit
 *
 * Usage:
 *   COMPOSIO_API_KEY=... OPENAI_API_KEY=... bun src/preload.ts
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { Composio, experimental_createTool, experimental_createToolkit } from '@composio/core';
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

const internalUsers: Record<string, Record<string, unknown>> = {
  'user-1': {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    team: 'platform',
    plan: 'enterprise',
  },
  'user-2': {
    id: 'user-2',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    team: 'developer-tools',
    plan: 'startup',
  },
};

const lookupInternalUser = experimental_createTool('LOOKUP_INTERNAL_USER', {
  name: 'Lookup internal user',
  description: 'Look up an internal demo user profile by user ID.',
  preload: true,
  inputParams: z.object({
    user_id: z.string().describe('Internal user ID, for example user-1'),
  }),
  execute: async ({ user_id }) => {
    const user = internalUsers[user_id];
    if (!user) {
      throw new Error(`User "${user_id}" not found`);
    }
    return user;
  },
});

const searchInternalUsers = experimental_createTool('SEARCH_INTERNAL_USERS', {
  name: 'Search internal users',
  description:
    'Search demo internal users by team. This custom tool is search-only because preload is not enabled.',
  inputParams: z.object({
    team: z.string().describe('Team name to search for'),
  }),
  execute: async ({ team }) => ({
    results: Object.values(internalUsers).filter(user => user.team === team),
  }),
});

const getAccountHealth = experimental_createTool('GET_ACCOUNT_HEALTH', {
  name: 'Get account health',
  description: 'Return internal account health details for a user.',
  inputParams: z.object({
    user_id: z.string().describe('Internal user ID'),
  }),
  execute: async ({ user_id }) => ({
    user_id,
    health: 'green',
    open_incidents: 0,
    renewal_risk: 'low',
  }),
});

const getAccountAuditLog = experimental_createTool('GET_ACCOUNT_AUDIT_LOG', {
  name: 'Get account audit log',
  description:
    'Return internal account audit events. This overrides the toolkit preload default and remains search-only.',
  preload: false,
  inputParams: z.object({
    user_id: z.string().describe('Internal user ID'),
  }),
  execute: async ({ user_id }) => ({
    user_id,
    events: ['login', 'settings_viewed'],
  }),
});

const internalAdmin = experimental_createToolkit('INTERNAL_ADMIN', {
  name: 'Internal admin',
  description: 'Demo internal administration tools.',
  preload: true,
  tools: [getAccountHealth, getAccountAuditLog],
});

const composio = new Composio({
  apiKey: composioApiKey,
  baseURL: process.env.COMPOSIO_BASE_URL || undefined,
  provider: new OpenAIAgentsProvider(),
});

const session = await composio.create('preload-example-user', {
  toolkits: ['hackernews'],
  tools: {
    hackernews: {
      enable: ['HACKERNEWS_GET_USER'],
    },
  },
  preload: {
    tools: ['HACKERNEWS_GET_USER'],
  },
  manageConnections: false,
  experimental: {
    customTools: [lookupInternalUser, searchInternalUsers],
    customToolkits: [internalAdmin],
  },
});

const tools = await session.tools();
const toolNames = tools.map(tool => tool.name);
assert(toolNames.includes('HACKERNEWS_GET_USER'));
assert(toolNames.includes('LOCAL_LOOKUP_INTERNAL_USER'));
assert(toolNames.includes('LOCAL_INTERNAL_ADMIN_GET_ACCOUNT_HEALTH'));
assert(!toolNames.includes('LOCAL_SEARCH_INTERNAL_USERS'));
assert(!toolNames.includes('LOCAL_INTERNAL_ADMIN_GET_ACCOUNT_AUDIT_LOG'));

console.log('Direct tools exposed to the agent:');
for (const tool of tools) {
  console.log(`- ${tool.name}`);
}

const agent = new Agent({
  name: 'Preload Demo Agent',
  instructions: 'Use the provided tools to perform the task.',
  model: process.env.OPENAI_MODEL ?? 'gpt-5.5',
  tools,
});

const prompt =
  process.argv.slice(2).join(' ') ||
  'Look up Hacker News user "pg", then look up internal user user-1 and their account health. Summarize the useful facts.';

console.log(`\nUser: ${prompt}\n`);
const result = await run(agent, prompt);
console.log(`Assistant: ${result.finalOutput}`);
