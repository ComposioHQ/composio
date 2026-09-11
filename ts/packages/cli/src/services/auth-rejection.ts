import { Context, Effect, Layer, Option, Ref } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { isUserApiKeyRejection } from 'src/utils/api-error-extraction';
import type { ApiKeySource } from 'src/utils/backend-resolution';

/**
 * A backend rejection of the user API key in use.
 */
export interface AuthRejection {
  /** Origin of the backend that rejected the key. */
  readonly baseURL: string;
  readonly keySource: ApiKeySource;
}

/**
 * Holds the first user API key rejection seen in this process. Rejections are
 * recorded where they happen, including inside commands that catch or swallow
 * API errors, and `cliProgram` reports them once after the command finishes.
 */
export class AuthRejectionRecorder extends Context.Service<
  AuthRejectionRecorder,
  {
    /** Keep `rejection` unless one was already recorded. */
    readonly record: (rejection: AuthRejection) => Effect.Effect<void>;
    readonly first: Effect.Effect<Option.Option<AuthRejection>>;
  }
>()('services/AuthRejectionRecorder') {
  static readonly Default = Layer.effect(
    AuthRejectionRecorder,
    Effect.gen(function* () {
      const state = yield* Ref.make(Option.none<AuthRejection>());
      return AuthRejectionRecorder.of({
        record: rejection =>
          Ref.update(state, current => Option.orElse(current, () => Option.some(rejection))),
        first: Ref.get(state),
      });
    })
  );
}

/**
 * Record `error` when it is a user API key rejection from a request made with
 * the key in use. Call it before swallowing an API error.
 */
export const recordIfUserApiKeyRejection = (error: unknown) =>
  Effect.gen(function* () {
    if (!isUserApiKeyRejection(error)) return;
    const recorder = yield* AuthRejectionRecorder;
    const ctx = yield* ComposioUserContext;
    yield* recorder.record({ baseURL: ctx.data.baseURL, keySource: ctx.backend.keySource });
  });
