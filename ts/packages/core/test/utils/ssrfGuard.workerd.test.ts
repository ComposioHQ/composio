import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposioBlockedInternalUrlError } from '../../src/errors/SsrfErrors';
import { ssrfSafeFetch } from '../../src/utils/ssrfGuard.workerd';

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
});
