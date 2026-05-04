import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * Spin up a local HTTP server on an ephemeral port, run the callback,
 * then tear down. Useful for integration-testing code that uses `fetch`.
 */
export async function withHttpServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host: '127.0.0.1' }, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to bind test server to an ephemeral port');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
