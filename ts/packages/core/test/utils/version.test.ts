import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkForLatestVersionFromNPM } from '../../src/utils/version';

describe('checkForLatestVersionFromNPM', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('bounds the registry request with the configured timeout signal', async () => {
    const signal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ version: '0.0.1' }));
    vi.stubGlobal('fetch', fetchMock);

    await checkForLatestVersionFromNPM('1.0.0');

    expect(timeoutSpy).toHaveBeenCalledWith(2_000);
    expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/@composio/core/latest', {
      signal,
    });
  });

  it('swallows a timeout from a registry request that never responds', async () => {
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
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
    timeoutController.abort(new DOMException('The operation timed out', 'TimeoutError'));

    await expect(versionCheck).resolves.toBeUndefined();
  });
});
