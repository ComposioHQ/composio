import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposioBlockedInternalUrlError } from '../../src/errors/SsrfErrors';
import { ssrfSafeFetch, ssrfSafeFetchWhereSupported } from '../../src/utils/ssrfGuard.workerd';

describe('ssrfSafeFetch (workerd)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fails closed without attempting a fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(ssrfSafeFetch('https://example.com/file.pdf')).rejects.toBeInstanceOf(
      ComposioBlockedInternalUrlError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets session file transfers through, since the guard cannot run here', async () => {
    // Failing closed would remove a working feature from Workers rather than
    // close a hole reachable there: an edge worker has no DNS API to validate
    // with, and its fetch does not originate inside the caller's network.
    const response = new Response('ok');
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      ssrfSafeFetchWhereSupported('https://s3.example.com/presigned', { method: 'PUT' })
    ).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/presigned', {
      method: 'PUT',
    });
  });
});
