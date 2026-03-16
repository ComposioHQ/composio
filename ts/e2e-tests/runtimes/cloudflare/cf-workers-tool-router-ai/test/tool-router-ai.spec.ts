import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Tool Router AI - Cloudflare Workers compatibility', () => {
  it('should list the available endpoints', async () => {
    const request = new IncomingRequest('http://localhost/');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      message: string;
      endpoints: string[];
    };

    expect(body.message).toContain('Tool Router AI E2E Test Worker');
    expect(body.endpoints).toMatchInlineSnapshot(`
      [
        "/test/mcp-client",
        "/test/agent",
      ]
    `);
  });

  it('should connect to MCP server', async () => {
    const request = new IncomingRequest('http://localhost/test/mcp-client');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      error?: string;
      mcpUrl?: string;
    };

    expect(response.status).toBe(200);
    expect(body.message).toContain('MCP client connected');
    expect(body.mcpUrl).toBeDefined();
  });

  it('should execute agent with Vercel AI SDK', async () => {
    const request = new IncomingRequest('http://localhost/test/agent');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      error?: string;
      sessionId?: string;
      toolCount?: number;
      toolCalls?: Array<{ toolName: string }>;
      response: {
        karma: number;
      };
    };

    expect(response.status).toBe(200);
    expect(body.message).toContain('Agent executed successfully');
    expect(body.sessionId).toBeDefined();
    expect(body.toolCount).toBeGreaterThan(0);
    expect(body.toolCalls).toBeDefined();
    expect(body.response).toBeDefined();
    expect(body.response.karma).toBeDefined();
    expect(typeof body.response.karma).toEqual('number');
    expect(body.response.karma).toBeGreaterThan(150_000);

    expect(body.toolCalls).toContainEqual({ toolName: 'COMPOSIO_SEARCH_TOOLS' });
  });
});
