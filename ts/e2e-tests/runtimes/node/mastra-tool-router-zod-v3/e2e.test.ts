/**
 * @composio/mastra + openai + zod 3
 *
 * Verifies that @composio/mastra works correctly with zod@3.
 *
 * See: https://github.com/ComposioHQ/composio/issues/2109.
 */

import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { getMcpCallToolMeta, MCPClient } from '@mastra/mcp';
import { Agent } from '@mastra/core/agent';
import { e2e } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect } from 'bun:test';
import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs } from 'ai';
import { z } from 'zod';

const MCP_CONNECT_TIMEOUT_MS = 15_000;
const KARMA_SCHEMA = z.object({ karma: z.number() });

const searchLogIdsSchema = z.object({
  log_id: z.string().optional(),
  request_id: z.string().optional(),
});
const searchResponseSchema = searchLogIdsSchema.extend({
  successful: z.boolean(),
  data: z
    .object({
      results: z.array(z.object({ primary_tool_slugs: z.array(z.string()) })).optional(),
      tool_schemas: z
        .object({
          HACKERNEWS_GET_USER: z
            .object({
              input_schema: z.object({ required: z.array(z.string()).optional() }).nullish(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});
const mcpSearchResultSchema = z.object({
  _meta: searchLogIdsSchema.optional(),
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
});

function searchDiagnostics(output: unknown) {
  const envelope = mcpSearchResultSchema.safeParse(output);
  const metadata = searchLogIdsSchema.safeParse(getMcpCallToolMeta(output)).data;
  const text = envelope.data?.content.map(part => part.text).join('');
  let response = searchResponseSchema.safeParse(output).data;
  if (text) {
    try {
      const decoded: unknown = JSON.parse(text);
      response = searchResponseSchema.safeParse(decoded).data ?? response;
    } catch {
      // A tool can return plain text in place of its usual JSON result.
    }
  }
  return { metadata: metadata ?? envelope.data?._meta, response };
}

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
    OPENAI_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: { node: ['22.23.5', '24.22.3', '26.13.1'] },
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
    OPENAI_API_KEY: Bun.env.OPENAI_API_KEY,
  },
  defineTests: () => {
    describe('@composio/mastra + openai + zod 3', () => {
      const composio = new Composio({
        apiKey: Bun.env.COMPOSIO_API_KEY,
        provider: new MastraProvider(),
      });

      it(
        'should work with Tool Router',
        async () => {
          const session = await composio.create('default', {
            toolkits: ['hackernews'],
            mcp: true,
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
            timeout: TIMEOUTS.LLM_LONG,
            servers: {
              myHttpClient: {
                url: new URL(mcp.url),
                connectTimeout: MCP_CONNECT_TIMEOUT_MS,
                requestInit: {
                  headers: mcp.headers,
                },
              },
            },
          });

          try {
            const tools = await mcpClient.listTools();
            expect(Object.keys(tools).length).toBeGreaterThan(0);
            const openai = createOpenAI({ apiKey: Bun.env.OPENAI_API_KEY });

            const hackernewsAgent = new Agent({
              id: 'test',
              name: 'test',
              instructions: `You're a helpful Hackernews agent, able to finding information about users.`,
              model: openai('gpt-5.1'),
              tools,
            });

            const result = await hackernewsAgent.generate(
              'Look up user "pg", and tell me their karma score.',
              { structuredOutput: { schema: KARMA_SCHEMA }, stopWhen: stepCountIs(10) }
            );

            const parsed = KARMA_SCHEMA.safeParse(result.object);
            if (!parsed.success) {
              const searchResults = result.toolResults
                .filter(({ payload }) => payload.toolName === 'myHttpClient_COMPOSIO_SEARCH_TOOLS')
                .map(({ payload }) => ({
                  toolCallId: payload.toolCallId,
                  isError: payload.isError,
                  ...searchDiagnostics(payload.result),
                }));
              console.error(
                'Tool Router search diagnostics',
                JSON.stringify(
                  {
                    finishReason: result.finishReason,
                    toolCalls: result.toolCalls.map(({ payload }) => payload.toolName),
                    searchResults,
                  },
                  null,
                  2
                )
              );
              throw parsed.error;
            }

            expect(result.error).toBeUndefined();
            expect(parsed.data.karma).toBeGreaterThanOrEqual(0);
          } finally {
            await mcpClient.disconnect();
          }
        },
        {
          timeout: TIMEOUTS.LLM_LONG,
        }
      );
    });
  },
});
