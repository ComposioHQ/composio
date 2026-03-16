import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('@composio/core Files - Cloudflare Workers compatibility', () => {
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

    expect(body.message).toContain('Composio Core Files E2E Test Worker');
    expect(body.endpoints).toMatchInlineSnapshot(`
      [
        "/test/files/upload",
        "/test/files/download",
        "/test/file-modifier/error-message",
        "/test/auto-upload-disabled",
        "/test/default-config",
      ]
    `);
  });

  it('should throw an error when calling files.upload() in Cloudflare Workers', async () => {
    const request = new IncomingRequest('http://localhost/test/files/upload');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      error?: string;
    };

    expect(body.error).toContain('not supported in Cloudflare Workers');
  });

  it('should throw an error when calling files.download() in Cloudflare Workers', async () => {
    const request = new IncomingRequest('http://localhost/test/files/download');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      error?: string;
    };

    expect(body.error).toContain('not supported in Cloudflare Workers');
  });

  it('should throw FileToolModifier error when executing a tool in Cloudflare Workers', async () => {
    const request = new IncomingRequest('http://localhost/test/file-modifier/error-message');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      error?: string;
    };

    expect(body.error).toContain('not available on edge runtimes');
  });

  it('should successfully initialize Composio with autoUploadDownloadFiles disabled', async () => {
    const request = new IncomingRequest('http://localhost/test/auto-upload-disabled');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      hasProvider?: boolean;
      hasTools?: boolean;
      hasFiles?: boolean;
      recommendation?: string;
    };

    expect(body.success).toBe(true);
    expect(body.message).toContain('autoUploadDownloadFiles: false');
    expect(body.hasProvider).toBe(true);
    expect(body.hasTools).toBe(true);
    expect(body.hasFiles).toBe(true);
  });

  it('should successfully initialize Composio with default configuration', async () => {
    const request = new IncomingRequest('http://localhost/test/default-config');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      message?: string;
      hasProvider?: boolean;
      hasTools?: boolean;
      hasFiles?: boolean;
      note?: string;
    };

    expect(body.success).toBe(true);
    expect(body.message).toContain('default configuration');
    expect(body.hasProvider).toBe(true);
    expect(body.hasTools).toBe(true);
    expect(body.hasFiles).toBe(true);
    expect(body.note).toContain('autoUploadDownloadFiles defaults to false');
  });
});
