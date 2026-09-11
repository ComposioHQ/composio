import { describe, expect, it } from '@effect/vitest';
import {
  DEFAULT_BASE_URL,
  DEFAULT_WEB_URL,
  STAGING_BASE_URL,
  STAGING_WEB_URL,
} from 'src/constants';
import {
  type BackendOverrides,
  isSameBackend,
  loginCommandForBackend,
  resolveBackend,
} from 'src/utils/backend-resolution';

const noOverrides: BackendOverrides = {
  baseURL: undefined,
  webURL: undefined,
  environment: undefined,
};

const storedStaging = { baseURL: STAGING_BASE_URL, webURL: STAGING_WEB_URL };

describe('resolveBackend', () => {
  it('[Given] a stored staging login and no overrides [Then] targets the stored backend', () => {
    const resolution = resolveBackend({
      overrides: noOverrides,
      stored: storedStaging,
      keySource: 'stored',
    });

    expect(resolution.target).toEqual(storedStaging);
    expect(resolution.stored).toEqual(storedStaging);
    expect(resolution.mismatch).toBe(false);
    expect(resolution.overrideVariable).toBeUndefined();
  });

  it('[Given] no stored base_url [Then] targets the ambient default', () => {
    const resolution = resolveBackend({
      overrides: noOverrides,
      stored: { baseURL: undefined, webURL: STAGING_WEB_URL },
      keySource: 'stored',
    });

    expect(resolution.target).toEqual({ baseURL: DEFAULT_BASE_URL, webURL: DEFAULT_WEB_URL });
    expect(resolution.stored).toBeUndefined();
    expect(resolution.mismatch).toBe(false);
  });

  it('[Given] COMPOSIO_BASE_URL points at another backend [Then] the override wins and reports a mismatch', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, baseURL: DEFAULT_BASE_URL },
      stored: storedStaging,
      keySource: 'stored',
    });

    expect(resolution.target.baseURL).toBe(DEFAULT_BASE_URL);
    expect(resolution.mismatch).toBe(true);
    expect(resolution.overrideVariable).toBe('COMPOSIO_BASE_URL');
  });

  it('[Given] COMPOSIO_ENVIRONMENT=staging with a stored staging login [Then] no mismatch', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, environment: 'staging' },
      stored: storedStaging,
      keySource: 'stored',
    });

    expect(resolution.target).toEqual(storedStaging);
    expect(resolution.mismatch).toBe(false);
    expect(resolution.overrideVariable).toBe('COMPOSIO_ENVIRONMENT');
  });

  it('[Given] COMPOSIO_ENVIRONMENT=production with a stored staging login [Then] reports a mismatch', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, environment: 'production' },
      stored: storedStaging,
      keySource: 'stored',
    });

    expect(resolution.target).toEqual({ baseURL: DEFAULT_BASE_URL, webURL: DEFAULT_WEB_URL });
    expect(resolution.mismatch).toBe(true);
    expect(resolution.overrideVariable).toBe('COMPOSIO_ENVIRONMENT');
  });

  it('[Given] COMPOSIO_BASE_URL and COMPOSIO_ENVIRONMENT are both set [Then] names COMPOSIO_BASE_URL', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, baseURL: DEFAULT_BASE_URL, environment: 'staging' },
      stored: storedStaging,
      keySource: 'stored',
    });

    expect(resolution.target.baseURL).toBe(DEFAULT_BASE_URL);
    expect(resolution.overrideVariable).toBe('COMPOSIO_BASE_URL');
  });

  it('[Given] only COMPOSIO_WEB_URL is set [Then] keeps the stored backend and overrides the web URL', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, webURL: 'https://web.example.test/' },
      stored: storedStaging,
      keySource: 'stored',
    });

    expect(resolution.target).toEqual({
      baseURL: STAGING_BASE_URL,
      webURL: 'https://web.example.test/',
    });
    expect(resolution.mismatch).toBe(false);
    expect(resolution.overrideVariable).toBeUndefined();
  });

  it('[Given] a trailing slash on the override [Then] it compares as the same backend', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, baseURL: `${STAGING_BASE_URL}/` },
      stored: storedStaging,
      keySource: 'stored',
    });

    expect(resolution.mismatch).toBe(false);
  });

  it('[Given] the key comes from COMPOSIO_USER_API_KEY [Then] targets the ambient backend without a mismatch', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, baseURL: DEFAULT_BASE_URL },
      stored: storedStaging,
      keySource: 'env',
    });

    expect(resolution.target).toEqual({ baseURL: DEFAULT_BASE_URL, webURL: DEFAULT_WEB_URL });
    expect(resolution.mismatch).toBe(false);
    expect(resolution.keySource).toBe('env');
  });

  it('[Given] no key at all [Then] targets the ambient backend', () => {
    const resolution = resolveBackend({
      overrides: noOverrides,
      stored: storedStaging,
      keySource: 'none',
    });

    expect(resolution.target).toEqual({ baseURL: DEFAULT_BASE_URL, webURL: DEFAULT_WEB_URL });
    expect(resolution.mismatch).toBe(false);
  });

  it('[Given] a stored base_url without web_url [Then] the web URL falls back to the ambient one', () => {
    const resolution = resolveBackend({
      overrides: noOverrides,
      stored: { baseURL: STAGING_BASE_URL, webURL: undefined },
      keySource: 'stored',
    });

    expect(resolution.target).toEqual({ baseURL: STAGING_BASE_URL, webURL: DEFAULT_WEB_URL });
  });

  it('[Given] COMPOSIO_ENVIRONMENT=staging and nothing stored [Then] the ambient backend is staging', () => {
    const resolution = resolveBackend({
      overrides: { ...noOverrides, environment: 'staging' },
      stored: { baseURL: undefined, webURL: undefined },
      keySource: 'none',
    });

    expect(resolution.ambient).toEqual(storedStaging);
    expect(resolution.target).toEqual(storedStaging);
  });
});

describe('isSameBackend', () => {
  it.each([
    [STAGING_BASE_URL, `${STAGING_BASE_URL}/`, true],
    [STAGING_BASE_URL, ` ${STAGING_BASE_URL} `, true],
    [`${DEFAULT_BASE_URL}/api/v3`, DEFAULT_BASE_URL, true],
    ['HTTPS://Backend.Composio.dev', DEFAULT_BASE_URL, true],
    [STAGING_BASE_URL, DEFAULT_BASE_URL, false],
    ['http://localhost:9900', 'http://localhost:9901', false],
    ['not a url/', 'not a url', true],
    ['not a url', 'another', false],
  ])('%s vs %s → %s', (left, right, expected) => {
    expect(isSameBackend(left, right)).toBe(expected);
  });
});

describe('loginCommandForBackend', () => {
  it('[Given] production [Then] needs no environment prefix', () => {
    expect(loginCommandForBackend(`${DEFAULT_BASE_URL}/`)).toBe('composio login');
  });

  it('[Given] staging [Then] spells out COMPOSIO_ENVIRONMENT', () => {
    expect(loginCommandForBackend(STAGING_BASE_URL)).toBe(
      'COMPOSIO_ENVIRONMENT=staging composio login'
    );
  });

  it('[Given] a custom host [Then] spells out COMPOSIO_BASE_URL', () => {
    expect(loginCommandForBackend('http://localhost:9900')).toBe(
      'COMPOSIO_BASE_URL=http://localhost:9900 composio login'
    );
  });
});
