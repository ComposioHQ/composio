import { Effect, Option } from 'effect';
import { APP_CONFIG } from 'src/config';
import { withoutTrailingSlashes } from 'src/config/backend';
import * as constants from 'src/constants';
import { ComposioUserContext } from 'src/services/user-context';
import { findApiError } from 'src/utils/api-error-extraction';

/** Whether `value` (or a failure it wraps) is the backend rejecting the user API key. */
export const isRejectedUserApiKey = (value: unknown): boolean =>
  findApiError(value)?.details?.slug === 'UserApiKey_Unauthorized';

/**
 * The env vars that make `composio login` target the backend at `baseURL` and its Dashboard at
 * `webURL`, as a command prefix. `COMPOSIO_WEB_URL` is named only when `webURL` is not the
 * Dashboard the other variables already select, so the new login session opens where it can
 * be completed.
 */
/** `value` as one shell word: unchanged when it is plainly safe, else single-quoted. */
const shellWord = (value: string) =>
  /^[\w@%+=:,./-]+$/u.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

const loginTargetPrefix = (baseURL: string, webURL: string) => {
  const base = withoutTrailingSlashes(baseURL);
  const [backendVar, impliedWebURL] =
    base === withoutTrailingSlashes(constants.DEFAULT_BASE_URL)
      ? ['', constants.DEFAULT_WEB_URL]
      : base === withoutTrailingSlashes(constants.STAGING_BASE_URL)
        ? ['COMPOSIO_ENVIRONMENT=staging ', constants.STAGING_WEB_URL]
        : [`COMPOSIO_BASE_URL=${shellWord(base)} `, constants.DEFAULT_WEB_URL];
  const web = withoutTrailingSlashes(webURL);
  const webVar =
    web === withoutTrailingSlashes(impliedWebURL) ? '' : `COMPOSIO_WEB_URL=${shellWord(web)} `;
  return `${backendVar}${webVar}`;
};

/**
 * How to recover from a rejected user API key. `composio logout` forgets the stored login's
 * backend, so the login command names the backend that rejected the key, and its Dashboard,
 * when they are not production's. Reads the user context when the caller has one, without requiring it.
 */
export const rejectedUserApiKeyHint = Effect.gen(function* () {
  const keyFromEnv = yield* APP_CONFIG.USER_API_KEY.pipe(
    Effect.map(key => key !== undefined),
    Effect.orElseSucceed(() => false)
  );
  if (keyFromEnv) {
    return 'Replace the key in COMPOSIO_USER_API_KEY, then retry.';
  }
  const ctx = yield* Effect.serviceOption(ComposioUserContext);
  const prefix = Option.match(ctx, {
    onNone: () => '',
    onSome: c => loginTargetPrefix(c.data.baseURL, c.data.webURL),
  });
  return `Log in again, then retry:\n> composio logout && ${prefix}composio login`;
});
