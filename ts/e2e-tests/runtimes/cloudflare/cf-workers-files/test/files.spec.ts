import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Composio, type Tool } from '@composio/core';
import app from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('@composio/core Files - Cloudflare Workers compatibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('should surface the edge-runtime FileToolModifier error from execute() when auto-upload is enabled', async () => {
    // Runs inside workerd (vitest-pool-workers), so `#file_tool_modifier` resolves to the
    // .workerd variant — the exact module under test. We drive the real public execute()
    // pipeline and stub only the network tool lookup, so the before-execute file modifier
    // is reached without depending on a remote tool registry or network access.
    const composio = new Composio({
      apiKey: env.COMPOSIO_API_KEY,
      dangerouslyAllowAutoUploadDownloadFiles: true,
    });

    const fileTool: Tool = {
      slug: 'CUSTOM_FILE_TOOL',
      name: 'Custom File Tool',
      description: 'Fixture tool with a file-uploadable input',
      inputParameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            file_uploadable: true,
          },
        },
        required: ['file'],
      },
      toolkit: { slug: 'custom', name: 'custom' },
    };

    vi.spyOn(composio.tools, 'getRawComposioToolBySlug').mockResolvedValue(fileTool);

    await expect(
      composio.tools.execute('CUSTOM_FILE_TOOL', {
        arguments: {
          file: 'https://example.com/test.pdf',
        },
        dangerouslySkipVersionCheck: true,
      })
    ).rejects.toThrow('not available on edge runtimes');
  });

  it('should successfully initialize Composio with automatic file handling disabled', async () => {
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
    expect(body.message).toContain('dangerouslyAllowAutoUploadDownloadFiles: false');
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
    expect(body.note).toContain('dangerouslyAllowAutoUploadDownloadFiles defaults to false');
  });
});
