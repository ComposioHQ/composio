/**
 * Tool execution E2E fixture for @composio/core in Deno.
 *
 * Exercises the runtime path, not just the import surface: session
 * creation over fetch, custom-tool registration, Zod validation, and
 * in-process local tool execution.
 *
 * The core import is a relative path into the workspace's built dist
 * (baked into the e2e image by the CI Build step), so this suite tests
 * the local Effect v4 build rather than whatever `npm:@composio/core`
 * would resolve to from the registry. Requires COMPOSIO_API_KEY in the
 * environment (the e2e runner passes it into the container).
 */

import {
  Composio,
  experimental_createTool as createCustomTool,
} from '../../../../../packages/core/dist/index.mjs';
import { z } from 'npm:zod/v3';

const apiKey = Deno.env.get('COMPOSIO_API_KEY');
if (!apiKey) {
  console.error('COMPOSIO_API_KEY is required');
  Deno.exit(1);
}

// ── Define custom tools (local execute fns) ──────────────────

const getUserContext = createCustomTool('GET_USER_CONTEXT', {
  name: 'Get user context',
  description: 'Retrieve user preferences and history',
  inputParams: z.object({
    category: z.string().default('all'),
  }),
  execute: async input => ({ preferences: { category: input.category, source: 'local' } }),
});

const enrichedSearch = createCustomTool('ENRICHED_SEARCH', {
  name: 'Enriched search',
  description: 'Search and enrich results with user context',
  inputParams: z.object({
    query: z.string(),
  }),
  execute: async (input, ctx) => ({
    query: input.query,
    userId: ctx.userId,
  }),
});

const throwingTool = createCustomTool('THROWING_TOOL', {
  name: 'Throwing tool',
  description: 'A tool that always throws an error',
  inputParams: z.object({}),
  execute: async () => {
    throw new Error('intentional error for testing');
  },
});

const strictTool = createCustomTool('STRICT_TOOL', {
  name: 'Strict tool',
  description: 'Tool with strict numeric input',
  inputParams: z.object({
    count: z.number(),
  }),
  execute: async input => ({ doubled: input.count * 2 }),
});

// ── Create session and run tests ─────────────────────────────

const composio = new Composio({ apiKey });

async function main() {
  const userId = `e2e-deno-tools-${Date.now()}`;

  const session = await composio.create(userId, {
    toolkits: ['weathermap'],
    manageConnections: false,
    experimental: {
      customTools: [getUserContext, enrichedSearch, throwingTool, strictTool],
    },
  });
  if (!session.sessionId) {
    throw new Error('SESSION_CREATE failed: missing sessionId');
  }
  console.log('SESSION_CREATE_OK');

  // ── Test 1: Single local tool execution ──
  {
    const result = await session.execute('GET_USER_CONTEXT', { category: 'prefs' });
    if (result.data?.preferences?.category !== 'prefs') {
      throw new Error(`LOCAL_EXECUTE failed: ${JSON.stringify(result)}`);
    }
    if (result.data?.preferences?.source !== 'local') {
      throw new Error(`LOCAL_EXECUTE source mismatch: ${JSON.stringify(result)}`);
    }
    console.log('LOCAL_EXECUTE_OK');
  }

  // ── Test 2: Zod defaults applied ──
  {
    const result = await session.execute('GET_USER_CONTEXT', {});
    if (result.data?.preferences?.category !== 'all') {
      throw new Error(`ZOD_DEFAULTS failed: ${JSON.stringify(result)}`);
    }
    console.log('ZOD_DEFAULTS_OK');
  }

  // ── Test 3: Error handling — throw wrapped into { data, error } ──
  {
    const result = await session.execute('THROWING_TOOL', {});
    if (!result.error || !result.error.includes('intentional error')) {
      throw new Error(`ERROR_HANDLING failed: ${JSON.stringify(result)}`);
    }
    if (result.data === undefined) {
      throw new Error(`ERROR_HANDLING no data field: ${JSON.stringify(result)}`);
    }
    console.log('ERROR_HANDLING_OK');
  }

  // ── Test 4: Zod validation failure — wrong type wrapped into error ──
  {
    const result = await session.execute('STRICT_TOOL', { count: 'not-a-number' });
    if (!result.error) {
      throw new Error(`ZOD_VALIDATION_FAIL expected error: ${JSON.stringify(result)}`);
    }
    if (!result.error.toLowerCase().includes('validation')) {
      throw new Error(`ZOD_VALIDATION_FAIL expected validation error: ${result.error}`);
    }
    console.log('ZOD_VALIDATION_FAIL_OK');
  }

  // ── Test 5: Multiple local tools route correctly ──
  {
    const r1 = await session.execute('GET_USER_CONTEXT', { category: 'a' });
    const r2 = await session.execute('ENRICHED_SEARCH', { query: 'test' });
    if (r1.data?.preferences?.category !== 'a') {
      throw new Error(`MULTIPLE_TOOLS r1 failed: ${JSON.stringify(r1)}`);
    }
    if (r2.data?.query !== 'test') {
      throw new Error(`MULTIPLE_TOOLS r2 failed: ${JSON.stringify(r2)}`);
    }
    console.log('MULTIPLE_TOOLS_OK');
  }

  // ── Test 6: Session context injection (userId) ──
  {
    const result = await session.execute('ENRICHED_SEARCH', { query: 'context-test' });
    if (result.data?.userId !== userId) {
      throw new Error(`SESSION_CONTEXT userId mismatch: expected ${userId}, got ${JSON.stringify(result)}`);
    }
    console.log('SESSION_CONTEXT_OK');
  }

  // ── Test 7: Case-insensitive slug ──
  {
    const result = await session.execute('get_user_context', { category: 'case-test' });
    if (result.data?.preferences?.category !== 'case-test') {
      throw new Error(`CASE_INSENSITIVE failed: ${JSON.stringify(result)}`);
    }
    console.log('CASE_INSENSITIVE_OK');
  }

  // ── Test 8: Prefixed slug (LOCAL_) ──
  {
    const result = await session.execute('LOCAL_GET_USER_CONTEXT', { category: 'prefix-test' });
    if (result.data?.preferences?.category !== 'prefix-test') {
      throw new Error(`PREFIXED_SLUG failed: ${JSON.stringify(result)}`);
    }
    console.log('PREFIXED_SLUG_OK');
  }

  console.log('ALL_OK');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.log('ERROR:', message);
  Deno.exit(1);
});
