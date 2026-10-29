import { Effect, Layer, Option } from 'effect';
import {
  PendingLoginError,
  PendingLoginSession,
  type PendingLogin,
} from 'src/services/pending-login-session';

/**
 * An in-memory `PendingLoginSession`: `write` stamps `cachedAt`, `read` answers what was
 * written (or `initial`) and fails as `missing` once cleared, `clear` drops only the login with
 * the key it names, and `current` shows the cached login, for assertions.
 */
export const PendingLoginSessionTest = (initial: Option.Option<PendingLogin> = Option.none()) => {
  let cached = initial;
  const service = PendingLoginSession.of({
    write: session =>
      Effect.sync(() => {
        cached = Option.some({ ...session, cachedAt: '2026-01-01T00:00:00.000Z' });
      }),
    read: Effect.suspend(() =>
      Option.match(cached, {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.fail(
            new PendingLoginError({
              message: 'No pending login found. Run `composio login < /dev/null` first.',
              reason: 'missing',
            })
          ),
      })
    ),
    clear: key =>
      Effect.sync(() => {
        cached = Option.filter(cached, login => login.key !== key);
      }),
  });
  return {
    layer: Layer.succeed(PendingLoginSession, service),
    current: () => cached,
  };
};
