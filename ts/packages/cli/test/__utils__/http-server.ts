import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Effect } from 'effect';

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

/**
 * Effect variant of {@link withHttpServer}: the server lifecycle is managed
 * with acquireUseRelease so `use` can be an Effect run by @effect/vitest.
 */
export function withHttpServerEffect<A, E, R>(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  use: (baseUrl: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.promise(async () => {
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

      return { server, baseUrl: `http://127.0.0.1:${address.port}` };
    }),
    ({ baseUrl }) => use(baseUrl),
    ({ server }) =>
      Effect.promise(
        () =>
          new Promise<void>((resolve, reject) => {
            server.close(error => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          })
      )
  );
}
