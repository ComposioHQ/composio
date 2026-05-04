/**
 * E2E fixture: Custom local tools execution flow.
 * Tests local execution, remote execution, mixed routing, error handling,
 * and SessionContext chaining against the live Composio API.
 *
 * Uses weathermap toolkit (no auth needed, active connection).
 * Requires COMPOSIO_API_KEY in environment.
 */
import { Composio, experimental_createTool as createCustomTool } from '@composio/core';
import { z } from 'zod/v3';

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error('COMPOSIO_API_KEY is required');
  process.exit(1);
}

// ── Define custom tools ──────────────────────────────────────

const getUserContext = createCustomTool('GET_USER_CONTEXT', {
  name: 'Get user context',
  description: 'Retrieve user preferences and history',
  inputParams: z.object({
    category: z.string().default('all'),
  }),
  execute: async (input) => {
    return { preferences: { category: input.category, source: 'local' } };
  },
});

const enrichedSearch = createCustomTool('ENRICHED_SEARCH', {
  name: 'Enriched search',
  description: 'Search and enrich results with user context',
  inputParams: z.object({
    query: z.string(),
  }),
  execute: async (input, ctx) => {
    return {
      query: input.query,
      userId: ctx.userId,
    };
  },
});

const throwingTool = createCustomTool('THROWING_TOOL', {
  name: 'Throwing tool',
  description: 'A tool that always throws an error',
  inputParams: z.object({}),
  execute: async () => {
    throw new Error('intentional error for testing');
  },
});

// Tool with strict numeric schema — for Zod validation failure test
const strictTool = createCustomTool('STRICT_TOOL', {
  name: 'Strict tool',
  description: 'Tool with strict numeric input',
  inputParams: z.object({
    count: z.number(),
  }),
  execute: async (input) => {
    return { doubled: input.count * 2 };
  },
});

// Tool that chains into a remote tool via SessionContext.execute()
const weatherChain = createCustomTool('WEATHER_CHAIN', {
  name: 'Weather chain',
  description: 'Fetches weather via remote tool and enriches with local context',
  inputParams: z.object({
    city: z.string(),
  }),
  execute: async (input, ctx) => {
    // Call remote WEATHERMAP_WEATHER tool through SessionContext
    const weather = await ctx.execute('WEATHERMAP_WEATHER', {
      location: input.city,
    });
    return {
      city: input.city,
      userId: ctx.userId,
      weatherData: weather.data,
      weatherError: weather.error,
    };
  },
});

// ── Create session and run tests ─────────────────────────────

const composio = new Composio({ apiKey });

async function main() {
  const userId = `e2e-custom-tools-${Date.now()}`;

  const session = await composio.create(userId, {
    toolkits: ['weathermap'],
    manageConnections: false,
    experimental: {
      customTools: [getUserContext, enrichedSearch, throwingTool, strictTool, weatherChain],
    },
  });

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
    // Verify it didn't crash — we got a structured response
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
    if (!result.data?.userId) {
      throw new Error(`SESSION_CONTEXT failed: ${JSON.stringify(result)}`);
    }
    if (result.data.userId !== userId) {
      throw new Error(`SESSION_CONTEXT userId mismatch: expected ${userId}, got ${result.data.userId}`);
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

  // ── Test 9: SessionContext.execute() chaining — local tool calls remote tool ──
  // This is mixed local+remote execution: local tool runs in-process,
  // then calls WEATHERMAP_WEATHER on the backend via session.execute()
  {
    const result = await session.execute('WEATHER_CHAIN', { city: 'London' });
    if (result.error) {
      throw new Error(`CHAINED_EXECUTE failed: ${result.error}`);
    }
    if (result.data?.city !== 'London') {
      throw new Error(`CHAINED_EXECUTE city mismatch: ${JSON.stringify(result)}`);
    }
    if (!result.data?.userId) {
      throw new Error(`CHAINED_EXECUTE missing userId: ${JSON.stringify(result)}`);
    }
    // The chained remote call should have returned weather data
    if (!result.data?.weatherData) {
      throw new Error(`CHAINED_EXECUTE missing weatherData: ${JSON.stringify(result)}`);
    }
    console.log('CHAINED_EXECUTE_OK');
  }

  // ── Test 10: Non-existent tool returns error gracefully ──
  // Remote tools that don't exist throw from the backend (400).
  // Verify the SDK surfaces this as a catchable error, not a silent failure.
  {
    let caught = false;
    try {
      await session.execute('COMPLETELY_FAKE_TOOL_12345', {});
    } catch (err) {
      caught = true;
      if (!err.message?.includes('not found') && !err.message?.includes('400')) {
        throw new Error(`NONEXISTENT_TOOL unexpected error: ${err.message}`);
      }
    }
    if (!caught) {
      throw new Error('NONEXISTENT_TOOL expected an error but got success');
    }
    console.log('NONEXISTENT_TOOL_OK');
  }

  // ── Test 12: session.tools() wrapping ──
  {
    try {
      const tools = await session.tools();
      if (!tools) {
        throw new Error('tools() returned falsy value');
      }
      console.log('TOOLS_WRAPPING_OK');
    } catch (err) {
      // Expected — no provider configured, standard path used
      if (err.message?.includes('provider')) {
        console.log('TOOLS_WRAPPING_OK');
      } else {
        throw err;
      }
    }
  }

  console.log('ALL_OK');
}

main().catch((err) => {
  console.log('ERROR:', err?.message || err);
  process.exit(1);
});
