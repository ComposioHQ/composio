import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkForLatestVersionFromNPM } from '../../src/utils/version';

describe('checkForLatestVersionFromNPM', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('bounds the registry request and clears the timer once it responds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ version: '0.0.1' }));
    vi.stubGlobal('fetch', fetchMock);

    await checkForLatestVersionFromNPM('1.0.0');

    expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/@composio/core/latest', {
      signal: expect.any(AbortSignal),
    });
    // A timer left pending after the fetch resolved keeps a workerd request context
    // open for the full timeout on every successful check.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('swallows a timeout from a registry request that never responds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const versionCheck = checkForLatestVersionFromNPM('1.0.0');
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(versionCheck).resolves.toBeUndefined();
  });
});
