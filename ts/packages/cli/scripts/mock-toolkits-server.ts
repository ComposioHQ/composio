#!/usr/bin/env bun

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const GMAIL_TOOLKIT = {
  name: 'Gmail',
  slug: 'gmail',
  auth_schemes: ['OAUTH2'],
  composio_managed_auth_schemes: ['OAUTH2'],
  is_local_toolkit: false,
  meta: {
    description: 'Gmail toolkit for deterministic CLI e2e tests.',
    categories: [],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    available_versions: ['2024.01.01'],
    tools_count: 40,
    triggers_count: 2,
  },
  no_auth: false,
} as const;

const GMAIL_TOOLKIT_DETAILED = {
  name: 'Gmail',
  slug: 'gmail',
  is_local_toolkit: false,
  composio_managed_auth_schemes: ['OAUTH2'],
  no_auth: false,
  meta: {
    description: 'Gmail toolkit for deterministic CLI e2e tests.',
    categories: [],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    available_versions: ['2024.01.01'],
    tools_count: 40,
    triggers_count: 2,
  },
  auth_config_details: [
    {
      mode: 'OAUTH2',
      name: 'OAuth 2.0',
      fields: {
        auth_config_creation: {
          required: [],
          optional: [],
        },
        connected_account_initiation: {
          required: [],
          optional: [],
        },
      },
    },
  ],
} as const;

export interface MockToolkitsServer {
  readonly hostBaseUrl: string;
  readonly dockerBaseUrl: string;
  readonly requests: string[];
  readonly close: () => Promise<void>;
}

const sendJson = (res: ServerResponse, statusCode: number, body: unknown): void => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const matchingToolkits = (search: string | null): ReadonlyArray<typeof GMAIL_TOOLKIT> => {
  if (search === null || search.length === 0) {
    return [GMAIL_TOOLKIT];
  }

  const normalized = search.toLowerCase();
  if (normalized === 'gmail' || normalized === 'gmai') {
    return [GMAIL_TOOLKIT];
  }

  return [];
};

const parseLimit = (req: IncomingMessage): number => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const parsed = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
};

export async function startMockToolkitsListServer(options?: {
  host?: string;
  port?: number;
}): Promise<MockToolkitsServer> {
  const host = options?.host ?? '0.0.0.0';
  const port = options?.port ?? 0;
  const requests: string[] = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    requests.push(`${req.method ?? 'GET'} ${url.pathname}${url.search}`);

    if ((req.method ?? 'GET') === 'GET' && url.pathname === '/api/v3/toolkits') {
      const items = matchingToolkits(url.searchParams.get('search')).slice(0, parseLimit(req));
      sendJson(res, 200, {
        items,
        total_items: items.length,
        total_pages: 1,
        current_page: 1,
        next_cursor: null,
      });
      return;
    }

    if ((req.method ?? 'GET') === 'GET' && url.pathname === '/api/v3/toolkits/gmail') {
      sendJson(res, 200, GMAIL_TOOLKIT_DETAILED);
      return;
    }

    if ((req.method ?? 'GET') === 'GET' && url.pathname.startsWith('/api/v3/toolkits/')) {
      sendJson(res, 404, {
        error: `Toolkit not found: ${url.pathname.split('/').at(-1) ?? 'unknown'}`,
      });
      return;
    }

    if ((req.method ?? 'GET') === 'POST' && url.pathname === '/api/v3/cli/analytics') {
      sendJson(res, 204, {});
      return;
    }

    sendJson(res, 404, {
      error: `Unhandled mock route: ${req.method ?? 'GET'} ${url.pathname}`,
    });
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
    throw new Error('Failed to bind mock toolkits list server to a TCP port');
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

const parsePortArg = (): number | undefined => {
  const index = process.argv.indexOf('--port');
  if (index === -1) return undefined;

  const value = Number.parseInt(process.argv[index + 1] ?? '', 10);
  return Number.isFinite(value) ? value : undefined;
};

if (import.meta.main) {
  const server = await startMockToolkitsListServer({ port: parsePortArg() });

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  await new Promise(() => {});
}
