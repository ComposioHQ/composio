/**
 * Soulink Identity Tool Example
 *
 * Registers Soulink agent identity verification, credit checking, and
 * agent resolution as custom Composio tools. Any Composio-connected
 * agent can then verify identities and check trust scores.
 *
 * Soulink: https://soulink.dev
 */

import { Composio } from '@composio/core';
import 'dotenv/config';
import { z } from 'zod';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const SOULINK_API = 'https://soulink.dev/api/v1';

/**
 * Tool 1: Resolve an agent's on-chain identity
 */
await composio.tools.createCustomTool({
  slug: 'SOULINK_RESOLVE_AGENT',
  name: 'Resolve agent identity on Soulink',
  toolkitSlug: 'custom',
  description:
    'Look up an agent\'s verified on-chain identity by their .agent name. Returns wallet address, expiration, and registration status.',
  inputParams: z.object({
    name: z.string().describe('Agent name without .agent suffix (e.g., "helper-bot")'),
  }),
  execute: async (input) => {
    const res = await fetch(`${SOULINK_API}/resolve/${encodeURIComponent(input.name)}`);
    if (!res.ok) {
      return { successful: false, data: null, error: `Agent ${input.name} not found` };
    }
    return { successful: true, data: await res.json(), error: null };
  },
});

/**
 * Tool 2: Check an agent's credit score
 */
await composio.tools.createCustomTool({
  slug: 'SOULINK_CHECK_CREDIT',
  name: 'Check agent credit score on Soulink',
  toolkitSlug: 'custom',
  description:
    'Check an agent\'s on-chain credit score (0-100) based on peer behavior reports. Use this before interacting with unknown agents.',
  inputParams: z.object({
    name: z.string().describe('Agent name without .agent suffix'),
  }),
  execute: async (input) => {
    const res = await fetch(`${SOULINK_API}/credit/${encodeURIComponent(input.name)}`);
    if (!res.ok) {
      return { successful: false, data: null, error: `No credit data for ${input.name}` };
    }
    return { successful: true, data: await res.json(), error: null };
  },
});

/**
 * Tool 3: Verify an agent's identity via signed message
 */
await composio.tools.createCustomTool({
  slug: 'SOULINK_VERIFY_IDENTITY',
  name: 'Verify agent identity on Soulink',
  toolkitSlug: 'custom',
  description:
    'Verify that an agent owns the wallet associated with their .agent name by checking an EIP-191 signed message.',
  inputParams: z.object({
    name: z.string().describe('Agent name without .agent suffix'),
    signature: z.string().describe('EIP-191 signature hex string'),
    message: z.string().describe('Signed message in format: soulink:{name}:{unix_timestamp}'),
  }),
  execute: async (input) => {
    const res = await fetch(`${SOULINK_API}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return { successful: false, data: null, error: `Verification failed for ${input.name}` };
    }
    return { successful: true, data: await res.json(), error: null };
  },
});

console.log('Soulink tools registered successfully');

/**
 * Demo: use the registered tools
 */
async function main() {
  console.log('Resolving agent identity...');
  const resolveResult = await composio.tools.execute('SOULINK_RESOLVE_AGENT', {
    arguments: { name: 'helper-bot' },
    userId: 'default',
  });
  console.log('Resolve result:', resolveResult);

  console.log('\nChecking credit score...');
  const creditResult = await composio.tools.execute('SOULINK_CHECK_CREDIT', {
    arguments: { name: 'helper-bot' },
    userId: 'default',
  });
  console.log('Credit result:', creditResult);
}

main().catch(console.error);
