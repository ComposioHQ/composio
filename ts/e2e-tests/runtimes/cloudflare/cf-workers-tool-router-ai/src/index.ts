/**
 * E2E test worker for Tool Router AI pattern with Composio.
 * Tests MCP session creation, tool retrieval, and Vercel AI SDK integration
 * in the Cloudflare Workers runtime environment.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { generateText, stepCountIs } from 'ai';
import { Hono } from 'hono';

type Bindings = {
  COMPOSIO_API_KEY: string;
  COMPOSIO_BASE_URL: string;
  OPENAI_API_KEY: string;
};

const findNumberProperty = (value: unknown, propertyName: string): number | undefined => {
  if (typeof value === 'string') {
    try {
      return findNumberProperty(JSON.parse(value), propertyName);
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedValue = findNumberProperty(item, propertyName);
      if (nestedValue !== undefined) {
        return nestedValue;
      }
    }
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record[propertyName] === 'number') {
    return record[propertyName];
  }

  for (const nestedValue of Object.values(record)) {
    const result = findNumberProperty(nestedValue, propertyName);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Default route - lists available test endpoints
 */
app.get('/', c => {
  return c.json({
    message: 'Tool Router AI E2E Test Worker',
    endpoints: ['/test/mcp-client', '/test/agent'],
  });
});

/**
 * Test: MCP Client Connection
 * Tests that we can connect to the MCP server using @ai-sdk/mcp
 */
app.get('/test/mcp-client', async c => {
  const composio = new Composio({
    apiKey: c.env.COMPOSIO_API_KEY,
    baseURL: c.env.COMPOSIO_BASE_URL,
    provider: new VercelProvider(),
  });

  const session = await composio.create('default', {
    toolkits: ['hackernews'],
    manageConnections: true,
    tools: {
      hackernews: {
        enable: ['HACKERNEWS_GET_USER'],
      },
    },
  });

  const { mcp } = session;

  await createMCPClient({
    transport: {
      type: 'http',
      url: mcp.url,
      headers: mcp.headers,
    },
  });
  // Intentionally do not close the HTTP MCP client here: in workerd, @ai-sdk/mcp
  // aborts the pending stream and Vitest reports it as an unhandled rejection.

  return c.json({
    message: 'MCP client connected successfully',
    mcpUrl: mcp.url,
  });
});

/**
 * Test: Agent Execution
 * Tests the full workflow: create session, get tools, run agent with generateText.
 *
 * Note: this takes ~40s locally.
 */
app.get('/test/agent', async c => {
  const composio = new Composio({
    apiKey: c.env.COMPOSIO_API_KEY,
    baseURL: c.env.COMPOSIO_BASE_URL,
    provider: new VercelProvider(),
  });

  const session = await composio.create('default', {
    toolkits: ['hackernews'],
    manageConnections: true,
    preload: { tools: ['HACKERNEWS_GET_USER'] },
    tools: {
      hackernews: {
        enable: ['HACKERNEWS_GET_USER'],
      },
    },
  });

  const { mcp, sessionId } = session;

  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: mcp.url,
      headers: mcp.headers,
    },
  });
  // Intentionally do not close the HTTP MCP client here: in workerd, @ai-sdk/mcp
  // aborts the pending stream and Vitest reports it as an unhandled rejection.

  const tools = await mcpClient.tools();
  const openai = createOpenAI({ apiKey: c.env.OPENAI_API_KEY });

  const result = await generateText({
    model: openai('gpt-5.1-codex'),
    prompt: `Look up the HackerNews user "pg" with HACKERNEWS_GET_USER.`,
    toolChoice: { type: 'tool', toolName: 'HACKERNEWS_GET_USER' },
    stopWhen: stepCountIs(10),
    tools,
  });

  const toolCalls = result.steps.flatMap(step =>
    step.toolCalls.map(toolCall => ({ toolName: toolCall.toolName }))
  );
  const toolResults = result.steps.flatMap(step =>
    step.toolResults.map(toolResult => ({
      toolName: toolResult.toolName,
      output: toolResult.output,
    }))
  );
  const observedKarma = findNumberProperty(toolResults, 'karma');

  return c.json({
    message: 'Agent executed successfully',
    sessionId,
    toolCount: Object.keys(tools).length,
    toolCalls,
    toolResults,
    observedKarma,
    response: { karma: observedKarma },
  });
});

export default app;
