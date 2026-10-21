import { Option } from 'effect';

/** The environment variable that chose the backend, when one did. */
export type BackendVariable = 'COMPOSIO_BASE_URL' | 'COMPOSIO_ENVIRONMENT';

/** The backend the environment selects (`APP_CONFIG.BACKEND`). */
export interface EnvBackend {
  /** `COMPOSIO_BASE_URL`, else the `COMPOSIO_ENVIRONMENT` default, else production. */
  readonly baseURL: string;
  /** `COMPOSIO_WEB_URL`, else the `COMPOSIO_ENVIRONMENT` default, else production. */
  readonly webURL: string;
  /** `COMPOSIO_BASE_URL` when set, else `COMPOSIO_ENVIRONMENT` when set. */
  readonly selectedBy: Option.Option<BackendVariable>;
  /** Whether `COMPOSIO_WEB_URL` is set. */
  readonly webURLSet: boolean;
}

/** The backend a stored login was issued by, as `composio login` recorded it. */
export interface StoredBackend {
  readonly baseURL: string;
  readonly webURL: Option.Option<string>;
}

export interface Backend {
  readonly baseURL: string;
  readonly webURL: string;
}

/**
 * The backend the CLI talks to. An env var that selects a backend wins; otherwise a stored
 * login keeps using the backend that issued its key, so a staging login keeps calling staging
 * after `COMPOSIO_ENVIRONMENT` is unset. Pass `Option.none()` as `stored` for a key that is not
 * the stored login's (`COMPOSIO_USER_API_KEY`) or when nobody is logged in.
 */
export const resolveBackend = (env: EnvBackend, stored: Option.Option<StoredBackend>): Backend => {
  const login = Option.isSome(env.selectedBy) ? Option.none<StoredBackend>() : stored;
  return {
    baseURL: Option.match(login, { onNone: () => env.baseURL, onSome: s => s.baseURL }),
    webURL: env.webURLSet
      ? env.webURL
      : Option.flatMap(login, s => s.webURL).pipe(Option.getOrElse(() => env.webURL)),
  };
};

export interface BackendMismatch {
  readonly variable: BackendVariable;
  /** The backend that issued the stored key. */
  readonly issuedBy: string;
  /** The backend the env var sends it to instead. */
  readonly selected: string;
}

export const withoutTrailingSlashes = (url: string) => url.replace(/\/+$/u, '');

/** Set when an env var sends the stored login's key to a backend other than its issuer. */
export const backendMismatch = (
  env: EnvBackend,
  stored: Option.Option<StoredBackend>
): Option.Option<BackendMismatch> =>
  Option.flatMap(stored, login =>
    Option.flatMap(env.selectedBy, variable =>
      withoutTrailingSlashes(login.baseURL) === withoutTrailingSlashes(env.baseURL)
        ? Option.none()
        : Option.some({
            variable,
            issuedBy: withoutTrailingSlashes(login.baseURL),
            selected: withoutTrailingSlashes(env.baseURL),
          })
    )
  );

export const formatBackendMismatch = (mismatch: BackendMismatch) =>
  `${mismatch.variable} sends your stored API key to ${mismatch.selected}, but it was issued by ${mismatch.issuedBy}. ` +
  `Unset ${mismatch.variable} to use the backend you logged in to, or run \`composio logout && composio login\` to log in to ${mismatch.selected} instead.`;
