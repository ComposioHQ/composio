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
const SEARCH_TOOL = 'myHttpClient_COMPOSIO_SEARCH_TOOLS';

// Allowlist for failure logs: Zod strips every other field.
const idsSchema = z.object({ log_id: z.string().optional(), request_id: z.string().optional() });
const searchResponseSchema = idsSchema.extend({
  data: z
    .object({
      results: z.array(z.object({ primary_tool_slugs: z.array(z.string()).optional() })).optional(),
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
const mcpTextResultSchema = z.object({
  _meta: idsSchema.optional(),
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
});

/** Flat log record for one search result, given as a structured value or an MCP text envelope. */
function searchRecord(payload: { toolCallId: string; isError?: boolean; result: unknown }) {
  const envelope = mcpTextResultSchema.safeParse(payload.result).data;
  let value: unknown = payload.result;
  if (envelope) {
    try {
      value = JSON.parse(envelope.content.map(part => part.text).join(''));
    } catch {
      value = undefined;
    }
  }
  const response = searchResponseSchema.safeParse(value).data;
  const meta = idsSchema.safeParse(getMcpCallToolMeta(payload.result) ?? envelope?._meta).data;
  return {
    toolCallId: payload.toolCallId,
    isError: payload.isError,
    log_id: meta?.log_id ?? response?.log_id,
    request_id: meta?.request_id ?? response?.request_id,
    requiredInput: response?.data?.tool_schemas?.HACKERNEWS_GET_USER?.input_schema?.required,
    matchedSlugs: response?.data?.results?.flatMap(r => r.primary_tool_slugs ?? []),
  };
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
              const diagnostics = {
                finishReason: result.finishReason,
                toolCalls: result.toolCalls.map(({ payload }) => payload.toolName),
                searches: result.toolResults
                  .filter(({ payload }) => payload.toolName === SEARCH_TOOL)
                  .map(({ payload }) => searchRecord(payload)),
              };
              console.error('Tool Router search diagnostics', JSON.stringify(diagnostics, null, 2));
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
