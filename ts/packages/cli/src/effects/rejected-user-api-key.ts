import { Effect, Option } from 'effect';
import { APP_CONFIG } from 'src/config';
import { withoutTrailingSlashes } from 'src/config/backend';
import * as constants from 'src/constants';
import { ComposioUserContext } from 'src/services/user-context';
import { findApiError } from 'src/utils/api-error-extraction';

/** Whether `value` (or a failure it wraps) is the backend rejecting the user API key. */
const isRejectedUserApiKey = (value: unknown): boolean =>
  findApiError(value)?.details?.slug === 'UserApiKey_Unauthorized';

/**
 * Whether `value` (or a failure it wraps) is a 401 from the Composio API. Only
 * {@link isRejectedUserApiKey} says the user API key itself was rejected; any other 401 may be
 * about another credential.
 */
export const isUnauthorized = (value: unknown): boolean => findApiError(value)?.status === 401;

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

const keyFromEnv = APP_CONFIG.USER_API_KEY.pipe(
  Effect.map(key => key !== undefined),
  Effect.orElseSucceed(() => false)
);

/** The login command that replaces the stored login, on the backend that rejected its key. */
const loginAgainCommand = Effect.gen(function* () {
  const ctx = yield* Effect.serviceOption(ComposioUserContext);
  const prefix = Option.match(ctx, {
    onNone: () => '',
    onSome: c => loginTargetPrefix(c.data.baseURL, c.data.webURL),
  });
  return `composio logout && ${prefix}composio login`;
});

/**
 * How to recover from a rejected user API key. `composio logout` forgets the stored login's
 * backend, so the login command names the backend that rejected the key, and its Dashboard,
 * when they are not production's. Reads the user context when the caller has one, without requiring it.
 */
export const rejectedUserApiKeyHint = Effect.gen(function* () {
  if (yield* keyFromEnv) {
    return 'Replace the key in COMPOSIO_USER_API_KEY, then retry.';
  }
  return `Log in again, then retry:\n> ${yield* loginAgainCommand}`;
});

/**
 * How to recover from the 401 in `value`: {@link rejectedUserApiKeyHint} when the backend said
 * the user API key was rejected. Any other 401 names the login only as the likely cause, and
 * not at all without a user API key, which no login could have expired.
 */
export const unauthorizedHint = (value: unknown): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    if (isRejectedUserApiKey(value)) {
      return Option.some(yield* rejectedUserApiKeyHint);
    }
    if (yield* keyFromEnv) {
      return Option.some(
        'If the key in COMPOSIO_USER_API_KEY is no longer valid, replace it, then retry.'
      );
    }
    const ctx = yield* Effect.serviceOption(ComposioUserContext);
    const loggedIn = Option.exists(ctx, c => Option.isSome(c.data.apiKey));
    return loggedIn
      ? Option.some(
          `If your login expired, log in again, then retry:\n> ${yield* loginAgainCommand}`
        )
      : Option.none();
  });
