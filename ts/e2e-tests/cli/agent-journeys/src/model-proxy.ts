/**
 * The only way a journey container reaches a model during a live run.
 *
 * The agent inside the container gets a one-off token, never the API key: its
 * shell commands inherit its environment, so a key there could end up in a
 * transcript. This proxy checks the token, checks the model, swaps the token
 * for the key, and streams the answer back unchanged.
 *
 * It listens on every interface, because that is how a container reaches the
 * host, so the token is what keeps others on the network from using the key.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';

/** The models a live run may call. Anything else is refused before it costs anything. */
export const ALLOWED_MODELS = ['claude-haiku-5-5', 'claude-opus-5-5'] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

const UPSTREAM = 'https://api.anthropic.com';

/** Request headers that describe the hop, or carry a credential, and are never forwarded. */
const DROPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'x-api-key',
  'authorization',
  'accept-encoding',
]);

const ModelField = z.looseObject({ model: z.string().optional() });

export interface ModelProxy {
  /** Base URL for `ANTHROPIC_BASE_URL` inside a container. */
  readonly dockerUrl: string;
  /** What the agent sends as its API key. Valid only for this proxy's lifetime. */
  readonly token: string;
  /** Requests forwarded so far, per model. */
  readonly forwarded: () => Readonly<Record<string, number>>;
  /** Requests refused so far, with the reason. */
  readonly refused: () => ReadonlyArray<string>;
  close(): Promise<void>;
}

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

const refuse = (response: ServerResponse, status: number, message: string) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ type: 'error', error: { type: 'proxy_refused', message } }));
};

export const startModelProxy = async (options: { apiKey: string }): Promise<ModelProxy> => {
  const token = `sk-journey-${randomBytes(24).toString('hex')}`;
  const expected = Buffer.from(token);
  const forwarded: Record<string, number> = {};
  const refused: string[] = [];

  const tokenMatches = (request: IncomingMessage): boolean => {
    const header = request.headers['x-api-key'] ?? request.headers.authorization ?? '';
    const sent = Buffer.from(String(header).replace(/^Bearer\s+/i, ''));
    return sent.length === expected.length && timingSafeEqual(sent, expected);
  };

  const server = createServer((request, response) => {
    void (async () => {
      const path = request.url ?? '/';
      if (!tokenMatches(request)) {
        refused.push(`bad token for ${path}`);
        return refuse(response, 401, 'unknown token');
      }
      if (!path.startsWith('/v1/')) {
        refused.push(`path ${path}`);
        return refuse(response, 404, `only /v1/ is forwarded, not ${path}`);
      }
      const body = await readBody(request);
      if (body.length > 0) {
        const parsed = ModelField.safeParse(JSON.parse(body.toString('utf8')));
        const model = parsed.success ? parsed.data.model : undefined;
        if (model !== undefined && !ALLOWED_MODELS.some(allowed => allowed === model)) {
          refused.push(`model ${model}`);
          return refuse(response, 400, `model ${model} is not allowed in journey runs`);
        }
        if (model !== undefined) forwarded[model] = (forwarded[model] ?? 0) + 1;
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value === undefined || DROPPED_REQUEST_HEADERS.has(name)) continue;
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      headers.set('x-api-key', options.apiKey);

      const upstream = await fetch(`${UPSTREAM}${path}`, {
        method: request.method,
        headers,
        body: body.length > 0 ? new Uint8Array(body) : undefined,
      });
      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        // fetch already decoded the body, so its length and encoding no longer hold.
        if (name !== 'content-encoding' && name !== 'content-length') responseHeaders[name] = value;
      });
      response.writeHead(upstream.status, responseHeaders);
      if (upstream.body) {
        for await (const chunk of upstream.body) response.write(chunk);
      }
      response.end();
    })().catch(error => {
      if (!response.headersSent) {
        refuse(response, 502, error instanceof Error ? error.message : String(error));
      } else {
        response.destroy();
      }
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '0.0.0.0', port: 0 }, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('the model proxy has no port'));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    dockerUrl: `http://host.docker.internal:${port}`,
    token,
    forwarded: () => ({ ...forwarded }),
    refused: () => [...refused],
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};
