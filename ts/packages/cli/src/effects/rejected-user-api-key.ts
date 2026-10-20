import { Effect, Option } from 'effect';
import { APP_CONFIG } from 'src/config';
import { withoutTrailingSlashes } from 'src/config/backend';
import * as constants from 'src/constants';
import { ComposioUserContext } from 'src/services/user-context';
import { findApiError } from 'src/utils/api-error-extraction';

/** Whether `value` (or a failure it wraps) is the backend rejecting the user API key. */
export const isRejectedUserApiKey = (value: unknown): boolean =>
  findApiError(value)?.details?.slug === 'UserApiKey_Unauthorized';

/** The env var that makes `composio login` target `baseURL`, as a command prefix. */
const loginTargetPrefix = (baseURL: string) => {
  const url = withoutTrailingSlashes(baseURL);
  if (url === withoutTrailingSlashes(constants.DEFAULT_BASE_URL)) return '';
  if (url === withoutTrailingSlashes(constants.STAGING_BASE_URL)) {
    return 'COMPOSIO_ENVIRONMENT=staging ';
  }
  return `COMPOSIO_BASE_URL=${url} `;
};

/**
 * How to recover from a rejected user API key. `composio logout` forgets the stored login's
 * backend, so the login command names the backend that rejected the key when it is not
 * production. Reads the user context when the caller has one, without requiring it.
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
    onSome: c => loginTargetPrefix(c.data.baseURL),
  });
  return `Log in again, then retry:\n> composio logout && ${prefix}composio login`;
});
