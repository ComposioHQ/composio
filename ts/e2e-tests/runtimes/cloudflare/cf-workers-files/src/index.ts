/**
 * E2E test worker for @composio/core file operations in Cloudflare Workers.
 * Tests that file operations correctly throw errors in edge runtimes
 * and that the FileToolModifier.workerd.ts is properly loaded.
 */
import { Composio } from '@composio/core';
import { z } from 'zod/v3';
import { Hono } from 'hono';

type Bindings = {
  COMPOSIO_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Default route - lists available test endpoints
 */
app.get('/', c => {
  return c.json({
    message: 'Composio Core Files E2E Test Worker',
    endpoints: [
      '/test/files/upload',
      '/test/files/download',
      '/test/file-modifier/error-message',
      '/test/auto-upload-disabled',
      '/test/default-config',
    ],
  });
});

/**
 * Test: Files upload operation (should fail in Cloudflare Workers)
 * Tests that composio.files.upload() throws an appropriate error in edge runtimes
 */
app.get('/test/files/upload', async c => {
  try {
    const composio = new Composio({
      apiKey: c.env.COMPOSIO_API_KEY,
    });

    // Attempt to call files.upload - should throw an error
    await composio.files.upload({
      file: 'https://example.com/test.pdf',
      toolSlug: 'test-tool',
      toolkitSlug: 'test-toolkit',
    });

    // If we get here, the test failed - upload should have thrown
    return c.json(
      {
        error: 'Expected files.upload() to throw an error in Cloudflare Workers, but it did not',
      },
      { status: 500 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({
      error: errorMessage,
    });
  }
});

/**
 * Test: Files download operation (should fail in Cloudflare Workers)
 * Tests that composio.files.download() throws an appropriate error in edge runtimes
 */
app.get('/test/files/download', async c => {
  try {
    const composio = new Composio({
      apiKey: c.env.COMPOSIO_API_KEY,
    });

    // Attempt to call files.download - should throw an error
    await composio.files.download({
      s3Url: 'https://s3.example.com/test.pdf',
      toolSlug: 'test-tool',
      mimeType: 'application/pdf',
    });

    // If we get here, the test failed - download should have thrown
    return c.json(
      {
        error: 'Expected files.download() to throw an error in Cloudflare Workers, but it did not',
      },
      { status: 500 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({
      error: errorMessage,
    });
  }
});

/**
 * Test: FileToolModifier behavior (triggers the autoUploadDownloadFiles error)
 *
 * The FileToolModifier.workerd.ts throws an error when autoUploadDownloadFiles is enabled.
 * In workerd runtime, the default is false, so we explicitly enable it here to test the error.
 *
 * This endpoint actually executes a tool to trigger the real error from FileToolModifier.workerd.ts.
 */
app.get('/test/file-modifier/error-message', async c => {
  try {
    const composio = new Composio({
      apiKey: c.env.COMPOSIO_API_KEY,
      autoUploadDownloadFiles: true,
    });

    // Use a local custom tool to avoid depending on remote Composio tool registry.
    // Any execute() call with autoUploadDownloadFiles enabled will trigger FileToolModifier
    // in the workerd runtime.
    await composio.tools.createCustomTool({
      slug: 'CUSTOM_FILE_TOOL',
      name: 'Custom File Tool',
      inputParams: z.object({
        file: z.string(),
      }),
      execute: async () => ({
        data: {},
        error: null,
        successful: true,
        logId: undefined,
        sessionInfo: undefined,
      }),
    });

    await composio.tools.execute('CUSTOM_FILE_TOOL', {
      arguments: {
        file: 'https://example.com/test.pdf',
      },
      dangerouslySkipVersionCheck: true,
    });

    // If we get here, the test failed - execution should have thrown
    return c.json(
      {
        error: 'Expected tool execution to throw FileToolModifier error, but it did not',
      },
      { status: 500 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({
      error: errorMessage,
    });
  }
});

/**
 * Test: Composio initialization with autoUploadDownloadFiles disabled
 * 
 * In workerd runtime (Cloudflare Workers), autoUploadDownloadFiles defaults to false.
 * This test verifies that the default configuration works correctly and that
 * Composio can be initialized successfully without file upload/download support.
 */
app.get('/test/auto-upload-disabled', async c => {
  try {
    // Explicitly set autoUploadDownloadFiles: false (which is the default for workerd)
    // This is the recommended configuration for edge runtimes
    const composio = new Composio({
      apiKey: c.env.COMPOSIO_API_KEY,
      autoUploadDownloadFiles: false,
    });

    return c.json({
      success: true,
      message: 'Composio initialized successfully with autoUploadDownloadFiles: false',
      hasProvider: typeof composio.provider !== 'undefined',
      hasTools: typeof composio.tools !== 'undefined',
      hasFiles: typeof composio.files !== 'undefined',
      recommendation:
        'Use this configuration in edge runtimes to avoid FileToolModifier errors. ' +
        'Note that file upload/download operations will not be automatically handled.',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});

/**
 * Test: Composio initialization with default configuration
 * 
 * This test verifies that Composio initializes correctly with the default
 * configuration for workerd runtime (autoUploadDownloadFiles: false by default).
 * No explicit configuration is provided, relying on the runtime defaults.
 */
app.get('/test/default-config', async c => {
  try {
    // Initialize Composio without explicitly setting autoUploadDownloadFiles
    // Should use the workerd default (false)
    const composio = new Composio({
      apiKey: c.env.COMPOSIO_API_KEY,
    });

    return c.json({
      success: true,
      message: 'Composio initialized successfully with default configuration',
      hasProvider: typeof composio.provider !== 'undefined',
      hasTools: typeof composio.tools !== 'undefined',
      hasFiles: typeof composio.files !== 'undefined',
      note: 'In workerd runtime, autoUploadDownloadFiles defaults to false',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});

export default app;
