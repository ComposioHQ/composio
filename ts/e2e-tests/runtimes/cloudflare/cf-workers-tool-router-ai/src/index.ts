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
  COMPOSIO_BASE_URL: string;
  OPENAI_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const hackerNewsUserOutputSchema = z
  .union([
    z.object({
      username: z.string().optional(),
      karma: z.number(),
    }),
    z.object({
      data: z.object({
        username: z.string().optional(),
        karma: z.number(),
      }),
    }),
  ])
  .transform(output => ('data' in output ? output.data : output));

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

  const tools = await mcpClient.tools({
    schemas: {
      HACKERNEWS_GET_USER: {
        inputSchema: z.object({
          username: z.string(),
        }),
        outputSchema: hackerNewsUserOutputSchema,
      },
    },
  });
  const openai = createOpenAI({ apiKey: c.env.OPENAI_API_KEY });

  const result = await generateText({
    model: openai('gpt-5.1-codex'),
    prompt: `Look up the HackerNews user "pg" with HACKERNEWS_GET_USER, then return the exact karma value from that tool result.`,
    output: Output.object({
      schema: z.object({
        karma: z.number(),
      }),
    }),
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

  return c.json({
    message: 'Agent executed successfully',
    sessionId,
    toolCount: Object.keys(tools).length,
    toolCalls,
    toolResults,
    response: result.output,
  });
});

export default app;
