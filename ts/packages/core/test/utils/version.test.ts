import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkForLatestVersionFromNPM } from '../../src/utils/version';

describe('checkForLatestVersionFromNPM', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bounds the registry request with an AbortSignal so it cannot outlive the process', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: '0.0.1' })));
    vi.stubGlobal('fetch', fetchMock);

    await checkForLatestVersionFromNPM('1.0.0');

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]![1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up instead of hanging when the registry never responds', async () => {
    // A registry that accepts the request and never answers. Without a timeout this
    // promise never settles, which is exactly what keeps a real process alive.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
          })
      )
    );

    // Resolves (rather than hanging) only because the signal aborts it; the
    // function swallows the resulting TimeoutError.
    await expect(checkForLatestVersionFromNPM('1.0.0')).resolves.toBeUndefined();
  });

  it('never rejects when the registry errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ENOTFOUND registry.npmjs.org');
      })
    );

    await expect(checkForLatestVersionFromNPM('1.0.0')).resolves.toBeUndefined();
  });

  it('skips the request entirely for non-semver and prerelease versions', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: '9.9.9' })));
    vi.stubGlobal('fetch', fetchMock);

    await checkForLatestVersionFromNPM('not-a-version');
    await checkForLatestVersionFromNPM('1.0.0-alpha.1');
    await checkForLatestVersionFromNPM('1.0.0-beta.3');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
