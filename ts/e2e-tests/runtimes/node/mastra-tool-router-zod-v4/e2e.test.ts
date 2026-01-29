/**
 * @composio/mastra + openai + zod 4
 *
 * Verifies that @composio/mastra works correctly with zod@4.
 * 
 * See: https://github.com/ComposioHQ/composio/issues/2109.
 */

import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { MCPClient } from '@mastra/mcp';
import { Agent } from '@mastra/core/agent';
import { e2e } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect } from 'bun:test';
import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs } from 'ai';
import { z } from 'zod';

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
    OPENAI_API_KEY: string;
  }
}

e2e(import.meta.url, {
  nodeVersions: ['22.12.0'],
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
    OPENAI_API_KEY: Bun.env.OPENAI_API_KEY,
  },
  defineTests: () => {
    describe('@composio/mastra + openai + zod 4', () => {

      const composio = new Composio({
        apiKey: Bun.env.COMPOSIO_API_KEY,
        provider: new MastraProvider(),
      });
      
      it('should work with Tool Router', async () => {
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
        expect(sessionId).toBeDefined();

        // Create a client with an HTTP server (tries Streamable HTTP, falls back to SSE)
        const mcpClient = new MCPClient({
          servers: {
            myHttpClient: {
              url: new URL(mcp.url),
              requestInit: {
                headers: mcp.headers,
              },
            },
          },
        });

        const tools = await mcpClient.listTools();
        const openai = createOpenAI({ apiKey: Bun.env.OPENAI_API_KEY });

        const hackernewsAgent = new Agent({
          id: 'test',
          name: 'test',
          instructions: `You're a helpful Hackernews agent, able to finding information about users.`,
          model: openai('gpt-5.1'),
          tools,
        });

        const result = await hackernewsAgent.generate('Look up user "pg", and tell me their karma score.', {
          structuredOutput: {
            schema: z.object({
              karma: z.number(),
            }),
          },
          stopWhen: stepCountIs(10),
        });

        const toolCalls = result.toolCalls.flatMap(toolCall =>
          toolCall.payload.toolName
        );
        const toolCount = Object.keys(tools).length;

        expect(toolCount).toBeGreaterThan(0);
        expect(toolCalls).toBeDefined();
        expect(result.error).toBeUndefined();
        expect(result.object).toBeDefined();
        expect(result.object.karma).toBeGreaterThan(150_000);
      
        await mcpClient.disconnect();
      }, {
        timeout: TIMEOUTS.LLM_SHORT,
      });
    });
  }
});
