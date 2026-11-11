/**
 * The model proxy's refusals. Each request here is refused before anything is
 * forwarded, so the test needs no network and no key.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startModelProxy, type ModelProxy } from './src/model-proxy';

let proxy: ModelProxy;
let base: string;

beforeAll(async () => {
  proxy = await startModelProxy({ apiKey: 'sk-not-a-real-key' });
  base = proxy.dockerUrl.replace('host.docker.internal', '127.0.0.1');
});

afterAll(async () => {
  await proxy.close();
});

const post = (path: string, token: string, body: unknown = { model: 'claude-haiku-5-5' }) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'x-api-key': token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the model proxy', () => {
  it('refuses a request without its token', async () => {
    const response = await post('/v1/messages', 'sk-guess');
    expect(response.status).toBe(401);
  });

  it('refuses a path outside the API, however it is spelled', async () => {
    for (const path of ['/v2/messages', '/v1/../admin', '/v1/%2e%2e/admin']) {
      const response = await post(path, proxy.token);
      expect(response.status).toBe(404);
    }
  });

  it('refuses a model other than Haiku 5.5 and Opus 5.5', async () => {
    const response = await post('/v1/messages', proxy.token, { model: 'claude-fable-5-2' });
    expect(response.status).toBe(400);
    expect(proxy.refused().at(-1)).toBe('model claude-fable-5-2');
    expect(proxy.forwarded()).toEqual({});
  });
});
