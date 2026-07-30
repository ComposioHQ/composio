import { DateTime, Effect, Option } from 'effect';
import { OnboardingConfig } from 'src/models/cli-user-config';
import type { OnboardingLastExecution } from 'src/models/cli-user-config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';

export type PersistedOnboarding = {
  readonly hasExecuted: boolean;
  readonly lastExecution: OnboardingLastExecution | undefined;
};

export const DEFAULT_PERSISTED_ONBOARDING: PersistedOnboarding = {
  hasExecuted: false,
  lastExecution: undefined,
};

/** Read the durable onboarding facts. Never fails — an unreadable config reads as the default. */
export const readPersistedOnboarding: Effect.Effect<
  PersistedOnboarding,
  never,
  ComposioCliUserConfig
> = Effect.gen(function* () {
  const config = yield* ComposioCliUserConfig;
  return config.data.onboarding;
}).pipe(Effect.catchAll(() => Effect.succeed(DEFAULT_PERSISTED_ONBOARDING)));

/**
 * Record that a tool execution succeeded, flipping the execute gate for good.
 *
 * Errors are swallowed on purpose: every caller sits on the success path of a tool execution
 * that already happened, so a config write that fails must not turn a successful execution into
 * a failed command. `hasExecuted` is monotonic — it never flips back to `false` here.
 */
export const recordSuccessfulExecution = (params: {
  readonly slug: string;
}): Effect.Effect<void, never, ComposioCliUserConfig> =>
  Effect.gen(function* () {
    const config = yield* ComposioCliUserConfig;
    const now = yield* DateTime.now;

    yield* config.update({
      onboarding: OnboardingConfig.make({
        hasExecuted: true,
        lastExecution: Option.some({
          slug: params.slug,
          at: DateTime.formatIso(now),
        }),
      }),
    });
  }).pipe(Effect.catchAll(() => Effect.void));

/**
 * Clear the durable onboarding facts, so `composio onboard` replays from the execute gate.
 * The escape hatch behind `composio onboard --reset`.
 */
export const clearOnboardingExecution: Effect.Effect<void, never, ComposioCliUserConfig> =
  Effect.gen(function* () {
    const config = yield* ComposioCliUserConfig;

    yield* config.update({
      onboarding: OnboardingConfig.make({
        hasExecuted: false,
        lastExecution: Option.none(),
      }),
    });
  }).pipe(Effect.catchAll(() => Effect.void));
