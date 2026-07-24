#!/usr/bin/env bun

import { createServer, type ServerResponse } from 'node:http';

/**
 * Mock agents.composio.dev + the minimal Apollo endpoints the login flows
 * touch. Point the CLI at it via COMPOSIO_AGENTS_BASE_URL / COMPOSIO_BASE_URL.
 */

const AGENT_IDENTITY = {
  status: 'READY',
  slug: 'e2e-agent',
  email: 'e2e-agent@agent.composio.ai',
  composio_agent_key: 'cak_e2e_agent',
  composio: {
    member_id: 'mem_e2e_agent',
    org_id: 'org_e2e_agent',
    project_id: 'proj_e2e_agent',
    user_api_key: 'uak_e2e_agent',
  },
} as const;

export interface MockAgentsServer {
  readonly hostBaseUrl: string;
  readonly dockerBaseUrl: string;
  readonly requests: string[];
  readonly agentIdentity: typeof AGENT_IDENTITY;
  readonly close: () => Promise<void>;
}

const sendJson = (res: ServerResponse, statusCode: number, body: unknown): void => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

export async function startMockAgentsServer(options?: {
  host?: string;
  port?: number;
}): Promise<MockAgentsServer> {
  const host = options?.host ?? '0.0.0.0';
  const port = options?.port ?? 0;
  const requests: string[] = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const method = req.method ?? 'GET';
    requests.push(`${method} ${url.pathname}`);

    // agents.composio.dev surface
    if (method === 'POST' && url.pathname === '/api/signup') {
      sendJson(res, 200, AGENT_IDENTITY);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/whoami') {
      const authorized =
        req.headers.authorization === `Bearer ${AGENT_IDENTITY.composio_agent_key}`;
      sendJson(
        res,
        authorized ? 200 : 401,
        authorized ? AGENT_IDENTITY : { message: 'unauthorized' }
      );
      return;
    }

    // Apollo surface used by the default login path
    if (method === 'POST' && url.pathname === '/api/v3.1/cli/create-session') {
      sendJson(res, 200, {
        id: 'e2e00000-0000-4000-8000-000000000001',
        code: 'E2E123',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        status: 'pending',
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/v3/cli/analytics') {
      sendJson(res, 204, {});
      return;
    }

    // Unmocked routes are non-fatal to the flows under test; 404 exercises
    // their degrade paths.
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
    throw new Error('Failed to bind mock agents server to a TCP port');
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
    agentIdentity: AGENT_IDENTITY,
    close,
  };
}
