import { Data, Result } from 'effect';
import {
  DEFAULT_BASE_URL,
  DEFAULT_WEB_URL,
  STAGING_BASE_URL,
  STAGING_WEB_URL,
} from 'src/constants';

/**
 * Where the API key in use came from. The stored login environment only
 * applies to the stored key: a user API key works only on the backend that
 * issued it, and the CLI does not know which backend issued an env key.
 */
export type ApiKeySource = 'env' | 'stored' | 'none';

/**
 * The environment variable that explicitly selected a backend for this
 * invocation.
 */
export type BackendOverrideVariable = 'COMPOSIO_BASE_URL' | 'COMPOSIO_ENVIRONMENT';

export interface BackendTarget {
  readonly baseURL: string;
  readonly webURL: string;
}

/**
 * Raw environment overrides. Blank values must already be normalized to
 * `undefined`.
 */
export interface BackendOverrides {
  readonly baseURL: string | undefined;
  readonly webURL: string | undefined;
  readonly environment: string | undefined;
}

/**
 * The `base_url` / `web_url` recorded in `user_data.json` at login.
 */
export interface StoredBackend {
  readonly baseURL: string | undefined;
  readonly webURL: string | undefined;
}

export interface BackendResolution {
  /** Backend and web URL the invocation uses. */
  readonly target: BackendTarget;
  /** Backend selected by env vars, then production. Login flows target this. */
  readonly ambient: BackendTarget;
  /** The recorded login environment, when `user_data.json` has a `base_url`. */
  readonly stored: BackendTarget | undefined;
  readonly keySource: ApiKeySource;
  /** The env var that explicitly selected a backend, when one did. */
  readonly overrideVariable: BackendOverrideVariable | undefined;
  /** The stored key is in use, but an override sends it to another backend. */
  readonly mismatch: boolean;
}

export const resolveAmbientBackend = (overrides: BackendOverrides): BackendTarget => {
  const staging = overrides.environment === 'staging';
  return {
    baseURL: overrides.baseURL ?? (staging ? STAGING_BASE_URL : DEFAULT_BASE_URL),
    webURL: overrides.webURL ?? (staging ? STAGING_WEB_URL : DEFAULT_WEB_URL),
  };
};

const explicitOverrideVariable = (
  overrides: BackendOverrides
): BackendOverrideVariable | undefined => {
  if (overrides.baseURL !== undefined) return 'COMPOSIO_BASE_URL';
  if (overrides.environment !== undefined) return 'COMPOSIO_ENVIRONMENT';
  return undefined;
};

class BackendUrlParseError extends Data.TaggedError('BackendUrlParseError')<{
  readonly cause: unknown;
}> {}

const parseBackendUrl = (value: string) =>
  Result.try({
    try: () => new URL(value),
    catch: cause => new BackendUrlParseError({ cause }),
  });

const normalizeBackend = (value: string): string => {
  const trimmed = value.trim();
  return parseBackendUrl(trimmed).pipe(
    Result.map(url => url.origin),
    Result.filterOrFail(
      origin => origin !== 'null',
      () => new BackendUrlParseError({ cause: 'opaque origin' })
    ),
    Result.getOrElse(() => trimmed.replace(/\/+$/u, ''))
  );
};

/**
 * Compare two backend URLs by origin. A value that does not parse as a URL
 * compares as a trimmed string without trailing slashes.
 */
export const isSameBackend = (left: string, right: string): boolean =>
  normalizeBackend(left) === normalizeBackend(right);

/**
 * Resolve the backend for this invocation.
 *
 *   key in use          explicit override   stored base_url   → backend
 *   stored              no                  present           → stored
 *   stored              no                  absent            → ambient default
 *   stored              yes                 any               → override (mismatch when origins differ)
 *   env or none         any                 any               → ambient
 *
 * `COMPOSIO_WEB_URL` alone overrides only the web URL.
 */
export const resolveBackend = (params: {
  readonly overrides: BackendOverrides;
  readonly stored: StoredBackend;
  readonly keySource: ApiKeySource;
}): BackendResolution => {
  const { overrides, keySource } = params;
  const ambient = resolveAmbientBackend(overrides);
  const overrideVariable = explicitOverrideVariable(overrides);
  const stored: BackendTarget | undefined =
    params.stored.baseURL === undefined
      ? undefined
      : { baseURL: params.stored.baseURL, webURL: params.stored.webURL ?? ambient.webURL };

  const base = { ambient, stored, keySource, overrideVariable };

  if (keySource !== 'stored' || stored === undefined) {
    return { ...base, target: ambient, mismatch: false };
  }

  if (overrideVariable === undefined) {
    return {
      ...base,
      target: { baseURL: stored.baseURL, webURL: overrides.webURL ?? stored.webURL },
      mismatch: false,
    };
  }

  return { ...base, target: ambient, mismatch: !isSameBackend(ambient.baseURL, stored.baseURL) };
};

export const isProductionBackend = (baseURL: string): boolean =>
  isSameBackend(baseURL, DEFAULT_BASE_URL);

/**
 * Host name to show users for a backend URL.
 */
export const backendHost = (baseURL: string): string =>
  parseBackendUrl(baseURL.trim()).pipe(
    Result.map(url => url.host),
    Result.filterOrFail(
      host => host.length > 0,
      () => new BackendUrlParseError({ cause: 'empty host' })
    ),
    Result.getOrElse(() => baseURL.trim())
  );

/**
 * The `composio login` invocation that targets `baseURL`, spelling out the
 * environment when it is not production.
 */
export const loginCommandForBackend = (baseURL: string): string => {
  if (isProductionBackend(baseURL)) return 'composio login';
  if (isSameBackend(baseURL, STAGING_BASE_URL)) {
    return 'COMPOSIO_ENVIRONMENT=staging composio login';
  }
  return `COMPOSIO_BASE_URL=${baseURL.trim()} composio login`;
};
