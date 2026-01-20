/**
 * E2E test worker for Tool Router AI pattern with Composio.
 * Tests MCP session creation, tool retrieval, and Vercel AI SDK integration
 * in the Cloudflare Workers runtime environment.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { generateText, Output, stepCountIs } from 'ai';
import { Hono } from 'hono';
import { z } from 'zod/v4';

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
    message: 'Tool Router AI E2E Test Worker',
    endpoints: [
      '/test/mcp-client',
      '/test/agent',
    ],
  });
});

/**
 * Test: MCP Client Connection
 * Tests that we can connect to the MCP server using @ai-sdk/mcp
 */
app.get('/test/mcp-client', async c => {
  const composio = new Composio({
    apiKey: c.env.COMPOSIO_API_KEY,
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

  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: mcp.url,
      headers: mcp.headers,
    },
  });

  c.executionCtx.waitUntil(mcpClient.close());

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

  const { mcp, sessionId } = session;

  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: mcp.url,
      headers: mcp.headers,
    },
  });

  const tools = await mcpClient.tools();
  const openai = createOpenAI({ apiKey: c.env.OPENAI_API_KEY });

  const result = await generateText({
    model: openai('gpt-5.1-codex'),
    prompt: `Look up the HackerNews user "pg", and tell me their karma score.`,
    output: Output.object({
      schema: z.object({
        karma: z.number(),
      }),
    }),
    stopWhen: stepCountIs(10),
    tools,
  });

  const toolCalls = result.steps.flatMap(step =>
    step.toolCalls.map(tc => ({ toolName: tc.toolName }))
  );

  c.executionCtx.waitUntil(mcpClient.close());

  return c.json({
    message: 'Agent executed successfully',
    sessionId,
    toolCount: Object.keys(tools).length,
    toolCalls,
    response: result.output,
  });
});

export default app;
