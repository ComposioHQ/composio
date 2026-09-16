import { describe, it } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';
import { ConfigProvider, Effect, type LogLevel, Option, References } from 'effect';
import { setMinimumLogLevel } from 'src/effects/with-log-level';
import { extendConfigProvider } from 'src/services/config';

const withEnv = (entries: ReadonlyArray<readonly [string, string]>) =>
  Effect.provide(
    ConfigProvider.layer(
      extendConfigProvider(ConfigProvider.fromEnvRecord(Object.fromEntries(entries)))
    )
  );

const resolveMinimumLogLevel = (logLevelFromCLI: Option.Option<LogLevel.LogLevel>) =>
  Effect.service(References.MinimumLogLevel).pipe(
    Effect.provide(setMinimumLogLevel(logLevelFromCLI))
  );

describe('setMinimumLogLevel', () => {
  it.effect('[When] neither the flag nor COMPOSIO_LOG_LEVEL is set, it defaults to Info', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.none()).pipe(withEnv([]));
      assertEquals(level, 'Info');
    })
  );

  it.effect('[When] only COMPOSIO_LOG_LEVEL is set, it applies', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.none()).pipe(
        withEnv([['COMPOSIO_LOG_LEVEL', 'Error']])
      );
      assertEquals(level, 'Error');
    })
  );

  it.effect('[When] only --log-level is set, it applies', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.some('Debug')).pipe(withEnv([]));
      assertEquals(level, 'Debug');
    })
  );

  it.effect('[When] both are set, --log-level wins over COMPOSIO_LOG_LEVEL', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.some('Debug')).pipe(
        withEnv([['COMPOSIO_LOG_LEVEL', 'Error']])
      );
      assertEquals(level, 'Debug');
    })
  );
});
