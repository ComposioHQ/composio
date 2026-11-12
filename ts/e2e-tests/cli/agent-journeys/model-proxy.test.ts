/**
 * The model proxy's refusals. Each request here is refused before anything is
 * forwarded, so the test needs no network and no key.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { request } from 'node:http';
import { startModelProxy, type ModelProxy } from './src/model-proxy';

let proxy: ModelProxy;
let port: number;

beforeAll(async () => {
  proxy = await startModelProxy({ apiKey: 'sk-not-a-real-key' });
  port = Number(new URL(proxy.dockerUrl).port);
});

afterAll(async () => {
  await proxy.close();
});

/**
 * Sends the path exactly as written. `fetch` would resolve `..` segments
 * before sending, so the proxy would never see them.
 */
const send = (
  path: string,
  token: string,
  body: unknown = { model: 'claude-haiku-5-5' },
  method = 'POST'
) =>
  new Promise<number>((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'x-api-key': token, 'content-type': 'application/json' },
      },
      response => {
        response.resume();
        resolve(response.statusCode ?? 0);
      }
    );
    outgoing.on('error', reject);
    outgoing.end(method === 'GET' ? undefined : JSON.stringify(body));
  });

describe('the model proxy', () => {
  it('refuses a request without its token', async () => {
    expect(await send('/v1/messages', 'sk-guess')).toBe(401);
  });

  it('refuses a path outside the API, however it is spelled', async () => {
    for (const path of [
      '/v2/messages',
      '/v1/../admin',
      '/v1/%2e%2e/admin',
      '/v1/messages/../models',
    ]) {
      expect(await send(path, proxy.token)).toBe(404);
    }
  });

  it('refuses API endpoints other than messages, where a model could hide', async () => {
    const batch = { requests: [{ custom_id: 'a', params: { model: 'claude-fable-5-2' } }] };
    expect(await send('/v1/messages/batches', proxy.token, batch)).toBe(404);
    expect(await send('/v1/models', proxy.token, undefined, 'GET')).toBe(404);
    expect(await send('/v1/messages', proxy.token, undefined, 'GET')).toBe(404);
  });

  it('refuses a model other than Haiku 5.5 and Opus 5.5', async () => {
    expect(await send('/v1/messages', proxy.token, { model: 'claude-fable-5-2' })).toBe(400);
    expect(proxy.refused().at(-1)).toBe('model claude-fable-5-2');
  });

  it('refuses a request that names no model', async () => {
    expect(await send('/v1/messages?beta=true', proxy.token, { messages: [] })).toBe(400);
    expect(await send('/v1/messages/count_tokens', proxy.token, 'not json')).toBe(400);
    expect(proxy.refused().at(-1)).toBe('model (none)');
    expect(proxy.forwarded()).toEqual({});
  });
});
