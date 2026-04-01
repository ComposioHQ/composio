#!/usr/bin/env bun

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const ORGANIZATIONS = [
  { id: 'org_alpha', name: 'Alpha Org' },
  { id: 'org_beta', name: 'Beta Org' },
  { id: 'org_gamma', name: 'Gamma Org' },
] as const;

export interface MockOrgsSwitchServer {
  readonly hostBaseUrl: string;
  readonly dockerBaseUrl: string;
  readonly requests: string[];
  readonly close: () => Promise<void>;
}

const sendJson = (res: ServerResponse, statusCode: number, body: unknown): void => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readLimit = (req: IncomingMessage): number => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const parsed = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ORGANIZATIONS.length;
};

export async function startMockOrgsSwitchServer(options?: {
  host?: string;
  port?: number;
}): Promise<MockOrgsSwitchServer> {
  const host = options?.host ?? '0.0.0.0';
  const port = options?.port ?? 0;
  const requests: string[] = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    requests.push(`${req.method ?? 'GET'} ${url.pathname}${url.search}`);

    if ((req.method ?? 'GET') === 'GET' && url.pathname === '/api/v3/org/list') {
      const limit = readLimit(req);
      sendJson(res, 200, {
        organizations: ORGANIZATIONS.slice(0, limit),
        total_items: ORGANIZATIONS.length,
        total_pages: 1,
        current_page: 1,
        next_cursor: null,
      });
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
    throw new Error('Failed to bind mock orgs switch server to a TCP port');
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
  const server = await startMockOrgsSwitchServer({ port: parsePortArg() });

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
