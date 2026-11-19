import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { readStdinToEnd } from 'src/services/stdin';

const SILENCE_TIMEOUT_MS = 1000;

/** Marks a read still waiting, so a test can tell a pending read from a resolved one. */
const PENDING = Symbol('pending');

const settledValue = async (read: Promise<string | undefined>) => {
  await vi.advanceTimersByTimeAsync(0);
  return Promise.race([read, Promise.resolve(PENDING)]);
};

describe('readStdinToEnd', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[Given] a pipe that never sends data or closes [Then] resolves undefined once the silence timeout passes', async () => {
    const input = new PassThrough();
    const read = readStdinToEnd(input, SILENCE_TIMEOUT_MS);

    await vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS - 1);
    expect(await settledValue(read)).toBe(PENDING);

    await vi.advanceTimersByTimeAsync(1);
    expect(await settledValue(read)).toBeUndefined();
    expect(input.listenerCount('data')).toBe(0);
    expect(input.isPaused()).toBe(true);
  });

  it('[Given] stdin that closes without data [Then] resolves an empty string', async () => {
    const input = new PassThrough();
    const read = readStdinToEnd(input, SILENCE_TIMEOUT_MS);
    input.end();

    expect(await settledValue(read)).toBe('');
  });

  it('[Given] data before the silence timeout and the end of input after it [Then] reads everything', async () => {
    const input = new PassThrough();
    const read = readStdinToEnd(input, SILENCE_TIMEOUT_MS);
    input.write('{"owner":');

    await vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS * 3);
    expect(await settledValue(read)).toBe(PENDING);

    input.end('"composio"}');
    expect(await settledValue(read)).toBe('{"owner":"composio"}');
  });

  it('[Given] no silence timeout [Then] waits for the end of input however late it arrives', async () => {
    const input = new PassThrough();
    const read = readStdinToEnd(input);

    await vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS * 60);
    expect(await settledValue(read)).toBe(PENDING);

    input.end('late');
    expect(await settledValue(read)).toBe('late');
  });
});
