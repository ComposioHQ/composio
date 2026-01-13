import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('@composio/core Cloudflare Workers compatibility', () => {
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

    expect(body.message).toContain('Composio Core Platform E2E Test Worker');
    expect(body.endpoints).toMatchInlineSnapshot(`
      [
        "/test/import",
        "/test/files/upload",
        "/test/files/download",
        "/test/hackernews",
      ]
    `);
  });

  it('should import and instantiate Composio without runtime errors', async () => {
    const request = new IncomingRequest('http://localhost/test/import');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      error?: string;
      hasProvider?: boolean;
      hasTools?: boolean;
    };

    expect(body.success).toBe(true);
    expect(body.message).toContain('successfully');
    expect(body.hasProvider).toBe(true);
    expect(body.hasTools).toBe(true);
  });

  it('should throw an error when calling files.upload() in Cloudflare Workers', async () => {
    const request = new IncomingRequest('http://localhost/test/files/upload');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      error?: string;
    };

    expect(body.success).toBe(true);
    expect(body.message).toContain('correctly throws an error');
    expect(body.error).toContain('not supported in Cloudflare Workers');
  });

  it('should throw an error when calling files.download() in Cloudflare Workers', async () => {
    const request = new IncomingRequest('http://localhost/test/files/download');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      error?: string;
    };

    expect(body.success).toBe(true);
    expect(body.message).toContain('correctly throws an error');
    expect(body.error).toContain('not supported in Cloudflare Workers');
  });

  it('should fetch HackerNews user pg successfully', async () => {
    const request = new IncomingRequest('http://localhost/test/hackernews');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      error?: string;
      data?: {
        response_data: {
          username: string;
          karma: number;
          about?: string;
        };
      };
    };

    console.log('HackerNews response:', JSON.stringify(body, null, 2));

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('pg');
    expect(body.data?.response_data?.username).toBe('pg');
    expect(body.data?.response_data?.karma).toBeGreaterThan(0);
  });
});
