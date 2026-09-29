import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Optional package roots let this same contract run against extracted tarballs.
const roots = process.argv.slice(2);
const packages = roots.length ? roots : ['../core', '.'];
for (const root of packages) {
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const { Composio } = await import(pathToFileURL(resolve(root, 'dist/index.mjs')).href);
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.headers);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ items: [], next_cursor: null }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const sdk = new Composio({
      apiKey: 'test-key',
      baseURL: `http://127.0.0.1:${server.address().port}`,
      allowTracking: false,
      allowTracing: false,
    });
    await sdk.toolkits.get({ limit: 1 });
    assert.equal(requests.length, 1);
    const headers = requests[0];
    assert.equal(headers['x-client-provenance'], manifest.name);
    assert.equal(headers['x-client-version'], manifest.version);
    assert.equal(headers['x-sdk-version'], manifest.version);
    assert.equal(headers['x-client-language'], 'typescript');
    assert.equal(headers['x-client-runtime'], 'nodejs');
    assert.equal(headers['x-runtime-version'], process.versions.node);
    assert.equal(headers['x-client-library'], '@composio/client');
    assert.ok(headers['x-client-library-version']);
    console.log(`${manifest.name}: HTTP product, version, runtime and library headers verified`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}
