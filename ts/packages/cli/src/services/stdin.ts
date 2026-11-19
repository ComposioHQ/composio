import process from 'node:process';
import { Context, Duration, Effect, Layer, Option } from 'effect';

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
  /**
   * Reads stdin to its end, unless stdin stays silent (no data and no end of input) for
   * `silenceTimeout`: then it stops listening and returns none. Once the first chunk or the end
   * of input arrives, it waits for the rest without a timeout.
   */
  readonly readAllUnlessSilent: (
    silenceTimeout: Duration.Duration
  ) => Effect.Effect<Option.Option<string>, Error>;
}

export const Stdin = Context.Service<Stdin>('services/Stdin');

/** Resolves `undefined` when `silenceTimeoutMs` passes before any data or the end of input. */
const readStdinToEnd = (silenceTimeoutMs?: number): Promise<string | undefined> =>
  new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let totalLength = 0;

    const onData = (chunk: string) => {
      clearTimeout(silenceTimer);
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

    const onSilence = () => {
      cleanup();
      // An agent harness or task runner can hand the CLI a pipe it never writes to or closes;
      // waiting for its end would hang the command with no output.
      process.stdin.pause();
      resolve(undefined);
    };

    const cleanup = () => {
      clearTimeout(silenceTimer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
    };

    const silenceTimer =
      silenceTimeoutMs === undefined ? undefined : setTimeout(onSilence, silenceTimeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });

const toStdinError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

export const StdinLive = Layer.succeed(
  Stdin,
  Stdin.of({
    isTTY: () => !!process.stdin.isTTY,
    readAll: () =>
      Effect.tryPromise({
        try: () => readStdinToEnd().then(text => text ?? ''),
        catch: toStdinError,
      }),
    readAllUnlessSilent: silenceTimeout =>
      Effect.tryPromise({
        try: () => readStdinToEnd(Duration.toMillis(silenceTimeout)),
        catch: toStdinError,
      }).pipe(Effect.map(Option.fromUndefinedOr)),
  })
);
