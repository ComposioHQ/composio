/**
 * E2E test worker for @composio/core platform compatibility.
 * Tests that the platform module correctly resolves to the workerd implementation
 * and that basic Composio SDK operations work without runtime errors.
 */
import { Composio } from '@composio/core';
import { Hono } from 'hono';

type Bindings = {
  COMPOSIO_API_KEY: string;
  OPENAI_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Default route - lists available test endpoints
 */
app.get('/', c => {
  return c.json({
    message: 'Composio Core Platform E2E Test Worker',
    endpoints: ['/test/import', '/test/hackernews'],
  });
});

/**
 * Test: Basic import and instantiation
 * Tests that @composio/core can be imported without runtime errors
 * and the platform module resolves to workerd.ts in this environment
 */
app.get('/test/import', c => {
  try {
    const composio = new Composio({
      apiKey: 'test-api-key', // Dummy key for instantiation test
    });

    return c.json({
      success: true,
      message: 'Composio SDK imported and instantiated successfully',
      hasProvider: typeof composio.provider !== 'undefined',
      hasTools: typeof composio.tools !== 'undefined',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
});

/**
 * Test: Hackernews user lookup
 * Tests that we can resolve who the 'pg' user is from Hackernews
 * using the HACKERNEWS_GET_USER tool
 */
app.get('/test/hackernews', async c => {
  try {
    const composio = new Composio({
      apiKey: c.env.COMPOSIO_API_KEY,
    });

    const userDetails = await composio.tools.execute('HACKERNEWS_GET_USER', {
      arguments: {
        username: 'pg',
      },
      userId: 'default',
      dangerouslySkipVersionCheck: true,
    });

    return c.json({
      success: true,
      message: 'Successfully fetched HackerNews user pg',
      data: userDetails.data,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
});

export default app;
