import { describe, it } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';
import { ConfigProvider, Effect, FiberRef, LogLevel, Option } from 'effect';
import { setMinimumLogLevel } from 'src/effects/with-log-level';
import { extendConfigProvider } from 'src/services/config';

const withEnv = (entries: ReadonlyArray<readonly [string, string]>) =>
  Effect.withConfigProvider(extendConfigProvider(ConfigProvider.fromMap(new Map(entries))));

const resolveMinimumLogLevel = (logLevelFromCLI: Option.Option<LogLevel.LogLevel>) =>
  FiberRef.get(FiberRef.currentMinimumLogLevel).pipe(
    Effect.provide(setMinimumLogLevel(logLevelFromCLI))
  );

describe('setMinimumLogLevel', () => {
  it.effect('[When] neither the flag nor COMPOSIO_LOG_LEVEL is set, it defaults to Info', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.none()).pipe(withEnv([]));
      assertEquals(level, LogLevel.Info);
    })
  );

  it.effect('[When] only COMPOSIO_LOG_LEVEL is set, it applies', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.none()).pipe(
        withEnv([['COMPOSIO_LOG_LEVEL', 'error']])
      );
      assertEquals(level, LogLevel.Error);
    })
  );

  it.effect('[When] only --log-level is set, it applies', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.some(LogLevel.Debug)).pipe(withEnv([]));
      assertEquals(level, LogLevel.Debug);
    })
  );

  it.effect('[When] both are set, --log-level wins over COMPOSIO_LOG_LEVEL', () =>
    Effect.gen(function* () {
      const level = yield* resolveMinimumLogLevel(Option.some(LogLevel.Debug)).pipe(
        withEnv([['COMPOSIO_LOG_LEVEL', 'error']])
      );
      assertEquals(level, LogLevel.Debug);
    })
  );
});
