import { describe, it, expect, vi } from 'vitest';
import ComposioClient from '@composio/client';
import { Tools } from '../../src/models/Tools';
import { ToolRouterSession } from '../../src/models/ToolRouterSession';
import { SessionContextImpl } from '../../src/models/SessionContext';
import { MockProvider } from '../utils/mocks/provider.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import type { Tool } from '../../src/types/tool.types';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: { instrument: vi.fn() },
}));

// Regression for https://github.com/ComposioHQ/composio/issues/3654: executing
// a tool or proxying an API call is a non-idempotent write, and the backend does
// not deduplicate executions. A retry after the backend already acted duplicates
// the side effect (e.g. sends the same email twice), so every execution path
// must reach the transport exactly once. Reads keep the client's default retries.
//
// These tests run a real client against a counting `fetch` so they observe the
// retry loop itself, not just the options the SDK passes to it.

const SESSION_ID = 'sess_123';

/** A real client whose every request is answered with a retryable 503. */
const createFailingClient = () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify({ error: { message: 'unavailable' } }), {
        status: 503,
        // Keep the retry backoff out of the test's wall-clock time.
        headers: { 'content-type': 'application/json', 'retry-after-ms': '1' },
      })
  );
  const client = new ComposioClient({
    apiKey: 'test-api-key',
    baseURL: 'https://backend.invalid',
    fetch,
  });
  return { client, fetch };
};

const createTools = (client: ComposioClient) => new Tools(client, { provider: new MockProvider() });

const createSession = (client: ComposioClient) =>
  new ToolRouterSession(client, { apiKey: 'key', provider: new MockProvider() }, SESSION_ID, {
    type: 'http' as const,
    url: `https://backend.invalid/api/v3/tool_router/session/${SESSION_ID}`,
  });

const proxyParams = {
  toolkit: 'github',
  endpoint: 'https://api.github.com/user/repos',
  method: 'POST' as const,
  body: { name: 'repo' },
};

const executionPaths: Array<{
  name: string;
  run: (client: ComposioClient) => Promise<unknown>;
}> = [
  {
    name: 'tools.execute',
    run: client => {
      const tools = createTools(client);
      // Keep the (read) tool-schema lookup off the transport.
      vi.spyOn(tools, 'getRawComposioToolBySlug').mockResolvedValue(
        toolMocks.transformedTool as unknown as Tool
      );
      return tools.execute('COMPOSIO_TOOL', {
        userId: 'test-user',
        arguments: { query: 'test' },
        dangerouslySkipVersionCheck: true,
      });
    },
  },
  {
    name: 'tools.proxyExecute',
    run: client =>
      createTools(client).proxyExecute({
        endpoint: '/api/test',
        method: 'POST',
        body: { data: 'test' },
        connectedAccountId: 'test-account-id',
      }),
  },
  {
    name: 'provider-wrapped session tool',
    run: client =>
      createTools(client).executeSessionTool('GMAIL_SEND_EMAIL', {
        sessionId: SESSION_ID,
        arguments: { to: 'test@test.com' },
      }),
  },
  {
    name: 'session.execute',
    run: client => createSession(client).execute('GMAIL_SEND_EMAIL', { to: 'test@test.com' }),
  },
  {
    name: 'session.proxyExecute',
    run: client => createSession(client).proxyExecute(proxyParams),
  },
  {
    name: 'custom tool context execute',
    run: client =>
      new SessionContextImpl(client, 'test-user', SESSION_ID).execute('GMAIL_SEND_EMAIL', {
        to: 'test@test.com',
      }),
  },
  {
    name: 'custom tool context proxyExecute',
    run: client =>
      new SessionContextImpl(client, 'test-user', SESSION_ID).proxyExecute(proxyParams),
  },
];

describe('tool execution is never retried', () => {
  it.each(executionPaths)('$name reaches the backend exactly once', async ({ run }) => {
    const { client, fetch } = createFailingClient();

    await expect(run(client)).rejects.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads keep the default retries', async () => {
    const { client, fetch } = createFailingClient();

    await expect(createTools(client).getToolsEnum()).rejects.toThrow();

    // The first attempt plus the client's two default retries.
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
