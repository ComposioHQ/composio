/**
 * Runs in a child process with the actual pinned SDK against a loopback server.
 * No unhandledRejection handler is installed: a stray rejection must fail the process.
 *
 * Usage: node --import tsx cancellation-child.ts <cancel|healthy>
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TypesafeAbortError, TypesafeProvider } from '../../src';

const mode = process.argv[2];
const controller = new AbortController();

const server = createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'application/json' });
    if (mode === 'healthy') {
      response.end(
        JSON.stringify({
          model: 'jev-loopback',
          answers: {
            route: {
              type: 'choice',
              choice: 'SYMBOLS_LIST',
              confidence: 0.9,
              probabilities: { SYMBOLS_LIST: 0.9, __none__: 0.1 },
            },
            gate_0: { type: 'noul', noul: 0.9 },
            gate_1: { type: 'noul', noul: 0.9 },
            gate_2: { type: 'noul', noul: 0.9 },
          },
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      );
      return;
    }
    // Headers and a partial body are out; cancel while the rest is pending.
    response.write('{"model":');
    setTimeout(() => controller.abort(), 20);
  });
});

await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const provider = new TypesafeProvider({ apiKey: 'synthetic-loopback-key' });
const toolSet = provider.wrapTools([
  { slug: 'SYMBOLS_LIST', name: 'List symbols', description: 'List every symbol.', tags: [] },
]);

try {
  const decision = await provider.decide(toolSet, 'list the symbols', {
    signal: controller.signal,
  });
  if (mode !== 'healthy' || decision.kind !== 'call') process.exitCode = 2;
  else console.log('healthy: call');
} catch (error) {
  if (mode === 'cancel' && error instanceof TypesafeAbortError) console.log('cancel: caught abort');
  else process.exitCode = 3;
}

server.closeAllConnections();
server.close();
// Give a stray rejection from the cancelled transport time to surface before exit.
await new Promise(resolve => setTimeout(resolve, 300));
