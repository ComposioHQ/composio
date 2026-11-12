#!/usr/bin/env bun

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * Mock of the Composio API routes `composio whoami` reads with a user API key.
 * `ACCEPTED_USER_API_KEY` gets a session; any other key gets the backend's 401
 * for a revoked user API key. Point the CLI at it via COMPOSIO_BASE_URL.
 */

export const ACCEPTED_USER_API_KEY = 'uak_mock_whoami_accepted';
export const REJECTED_USER_API_KEY = 'uak_mock_whoami_rejected';

// Valid against the client's `GET /api/v3.1/auth/session/info` response schema.
export const SESSION_INFO = {
  project: {
    auto_id: 1,
    id: '00000000-0000-4000-8000-000000000001',
    org_id: '00000000-0000-4000-8000-000000000002',
    name: 'Whoami E2E Project',
    email: 'project@whoami-e2e.test',
    nano_id: 'pr_whoami_e2e',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    webhook_url: null,
    event_webhook_url: null,
    webhook_secret: null,
    triggers_enabled: true,
    last_subscribed_at: null,
    deleted: false,
    is_new_webhook: true,
    webhook_version: 'V2',
    org: { id: 'ok_whoami_e2e', name: 'Whoami E2E Org', plan: 'FREE' },
  },
  api_key: null,
  org_member: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'whoami@whoami-e2e.test',
    name: 'Whoami E2E',
    role: 'admin',
    metadata: {},
  },
} as const;

// The backend's error envelope for a revoked or unknown user API key.
export const REJECTED_USER_API_KEY_BODY = {
  error: {
    message: 'Invalid or revoked user API key',
    code: 1803,
    slug: 'UserApiKey_Unauthorized',
    status: 401,
  },
} as const;

export interface MockWhoamiServer {
  readonly hostBaseUrl: string;
  readonly dockerBaseUrl: string;
  /** `METHOD /path` plus the user API key it was sent with, in arrival order. */
  readonly requests: string[];
  readonly close: () => Promise<void>;
}

const sendJson = (res: ServerResponse, statusCode: number, body: unknown): void => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const userApiKeyOf = (req: IncomingMessage): string | undefined => {
  const header = req.headers['x-user-api-key'];
  return Array.isArray(header) ? header[0] : header;
};

export async function startMockWhoamiServer(options?: {
  host?: string;
  port?: number;
}): Promise<MockWhoamiServer> {
  const host = options?.host ?? '0.0.0.0';
  const port = options?.port ?? 0;
  const requests: string[] = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const method = req.method ?? 'GET';
    const userApiKey = userApiKeyOf(req);
    requests.push(`${method} ${url.pathname} ${userApiKey ?? '(no user API key)'}`);

    if (method === 'POST' && url.pathname === '/api/v3/cli/analytics') {
      sendJson(res, 204, {});
      return;
    }

    if (userApiKey !== ACCEPTED_USER_API_KEY) {
      sendJson(res, 401, REJECTED_USER_API_KEY_BODY);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/v3.1/auth/session/info') {
      sendJson(res, 200, SESSION_INFO);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/v3.1/org/consumer/config') {
      sendJson(res, 200, { enhanced_controls: false });
      return;
    }

    sendJson(res, 404, { error: `Unhandled mock route: ${method} ${url.pathname}` });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port }, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to bind mock whoami server to a TCP port');
  }

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return {
    hostBaseUrl: `http://127.0.0.1:${address.port}`,
    dockerBaseUrl: `http://host.docker.internal:${address.port}`,
    requests,
    close,
  };
}
