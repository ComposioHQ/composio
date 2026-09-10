import { Effect } from 'effect';
import { OnboardingConfig } from 'src/models/cli-user-config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';

export type PersistedOnboarding = {
  readonly hasExecuted: boolean;
};

export const readPersistedOnboarding: Effect.Effect<
  PersistedOnboarding,
  never,
  ComposioCliUserConfig
> = Effect.map(ComposioCliUserConfig, config => config.data.onboarding);

export const recordSuccessfulOnboarding: Effect.Effect<void, never, ComposioCliUserConfig> =
  Effect.gen(function* () {
    const config = yield* ComposioCliUserConfig;
    if (config.data.onboarding.hasExecuted) {
      return;
    }

    yield* config.update({
      onboarding: OnboardingConfig.make({ hasExecuted: true }),
    });
  }).pipe(Effect.catchAll(() => Effect.void));
