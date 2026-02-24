import process from 'node:process';
import { Context, Effect, Layer } from 'effect';

const MAX_STDIN_SIZE = 10 * 1024 * 1024; // 10 MB

export class StdinSizeLimitError extends Error {
  constructor() {
    super(`Stdin input exceeds maximum size (${MAX_STDIN_SIZE} bytes)`);
    this.name = 'StdinSizeLimitError';
  }
}

export interface Stdin {
  readonly isTTY: () => boolean;
  readonly readAll: () => Effect.Effect<string, Error>;
}

export const Stdin = Context.GenericTag<Stdin>('services/Stdin');

const readAll = (): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let totalLength = 0;

    const onData = (chunk: string) => {
      totalLength += chunk.length;
      if (totalLength > MAX_STDIN_SIZE) {
        cleanup();
        reject(new StdinSizeLimitError());
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      cleanup();
      resolve(chunks.join(''));
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
    };

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });

export const StdinLive = Layer.succeed(
  Stdin,
  Stdin.of({
    isTTY: () => !!process.stdin.isTTY,
    readAll: () =>
      Effect.tryPromise({
        try: readAll,
        catch: e => (e instanceof Error ? e : new Error(String(e))),
      }),
  })
);
