import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import {
  HttpServerError,
  isTransientHttpServerError,
  retryTransientHttpRead,
} from 'src/services/composio-clients';

describe('isTransientHttpServerError', () => {
  it('treats network and 5xx errors as transient', () => {
    expect(isTransientHttpServerError(new HttpServerError({ cause: 'network' }))).toBe(true);
    expect(isTransientHttpServerError(new HttpServerError({ status: 429 }))).toBe(true);
    expect(isTransientHttpServerError(new HttpServerError({ status: 503 }))).toBe(true);
  });

  it('does not treat 4xx validation errors as transient', () => {
    expect(isTransientHttpServerError(new HttpServerError({ status: 400 }))).toBe(false);
    expect(isTransientHttpServerError(new HttpServerError({ status: 404 }))).toBe(false);
    expect(isTransientHttpServerError(new Error('boom'))).toBe(false);
  });
});

describe('retryTransientHttpRead', () => {
  it('retries transient HTTP failures before succeeding', async () => {
    let attempts = 0;

    const program = retryTransientHttpRead(
      Effect.suspend(() => {
        attempts += 1;

        return attempts < 3
          ? Effect.fail(new HttpServerError({ status: 503, cause: 'unavailable' }))
          : Effect.succeed('ok');
      }),
      [1, 1]
    );

    await expect(Effect.runPromise(program)).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry non-transient HTTP failures', async () => {
    let attempts = 0;

    const program = retryTransientHttpRead(
      Effect.suspend(() => {
        attempts += 1;
        return Effect.fail(new HttpServerError({ status: 400, cause: 'bad request' }));
      }),
      [1, 1]
    );

    await expect(Effect.runPromise(Effect.flip(program))).resolves.toMatchObject({ status: 400 });
    expect(attempts).toBe(1);
  });
});
