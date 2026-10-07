import { describe, expect, it } from '@effect/vitest';
import { isRemoteCustomToolkitSlug, isRemoteCustomToolSlug } from 'src/utils/remote-custom-toolkit';

describe('isRemoteCustomToolkitSlug', () => {
  it.each(['custom_grain', 'CUSTOM_GRAIN', 'custom_x_y'])('matches %s', slug => {
    expect(isRemoteCustomToolkitSlug(slug)).toBe(true);
  });

  it.each(['custom', 'custom_', 'customerio', 'customerio_mcp', 'customgpt', 'customjs', 'gmail'])(
    'does not match %s',
    slug => {
      expect(isRemoteCustomToolkitSlug(slug)).toBe(false);
    }
  );
});

describe('isRemoteCustomToolSlug', () => {
  it('matches tools of a remote custom toolkit', () => {
    expect(isRemoteCustomToolSlug('CUSTOM_GRAIN_SEARCH_PERSONS')).toBe(true);
  });

  it('does not match tools of native toolkits whose slug starts with "custom"', () => {
    expect(isRemoteCustomToolSlug('CUSTOMERIO_SEND_EVENT')).toBe(false);
  });
});
