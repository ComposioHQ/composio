import { describe, it, vi } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';

import { Config, ConfigProvider, Effect, Option, Data, LogLevel } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';
import { extendConfigProvider } from 'src/services/config';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';

describe('Config', () => {
  describe('[When] using `ConfigProvider.fromMap`', () => {
    const withMapConfigProvider = (map: Map<string, string>) =>
      Effect.withConfigProvider(extendConfigProvider(ConfigProvider.fromMap(map)));

    describe('APP_CONFIG', () => {
      it('[When] no map entry is set', () => {
        const map = new Map([]) satisfies Map<string, string>;

        const actual = Effect.runSync(
          withMapConfigProvider(map)(Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            API_KEY: Option.none(),
            BASE_URL: Option.none(),
            CACHE_DIR: Option.none(),
            LOG_LEVEL: Option.none(),
          })
        );
      });

      it('[When] map entries are set without `COMPOSIO_` prefix', () => {
        const map = new Map([
          ['API_KEY', 'api_key'],
          ['BASE_URL', 'https://test.localhost'],
          ['CACHE_DIR', '~/.composio'],
          ['LOG_LEVEL', 'info'],
        ]) satisfies Map<string, string>;

        const actual = Effect.runSync(
          withMapConfigProvider(map)(Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            API_KEY: Option.none(),
            BASE_URL: Option.none(),
            CACHE_DIR: Option.none(),
            LOG_LEVEL: Option.none(),
          })
        );
      });

      it('[When] env variables are set with `COMPOSIO_` prefix', () => {
        const map = new Map([
          ['COMPOSIO_API_KEY', 'api_key'],
          ['COMPOSIO_BASE_URL', 'https://test.localhost'],
          ['COMPOSIO_CACHE_DIR', '~/.composio'],
          ['COMPOSIO_LOG_LEVEL', 'info'],
        ]) satisfies Map<string, string>;

        const actual = Effect.runSync(
          withMapConfigProvider(map)(Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            API_KEY: Option.some('api_key'),
            BASE_URL: Option.some('https://test.localhost'),
            CACHE_DIR: Option.some('~/.composio'),
            LOG_LEVEL: Option.some(LogLevel.Info),
          })
        );
      });
    });

    describe('DEBUG_OVERRIDE_CONFIG', () => {
      it('[When] no map entries variable is set', () => {
        const map = new Map([]) satisfies Map<string, string>;

        const actual = Effect.runSync(
          withMapConfigProvider(map)(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          )
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.none(),
            VERSION: Option.none(),
          })
        );
      });

      it('[When] map entries are set without `DEBUG_OVERRIDE_` prefix', () => {
        const map = new Map([
          ['UPGRADE_TARGET', 'upgrade_target'],
          ['VERSION', 'x.x.x'],
        ]) satisfies Map<string, string>;

        const actual = Effect.runSync(
          withMapConfigProvider(map)(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          )
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.none(),
            VERSION: Option.none(),
          })
        );
      });

      it('[When] map entries are set without `DEBUG_OVERRIDE_` but with `COMPOSIO_` prefix', () => {
        const map = new Map([
          ['COMPOSIO_UPGRADE_TARGET', 'upgrade_target'],
          ['COMPOSIO_VERSION', 'x.x.x'],
        ]) satisfies Map<string, string>;

        const actual = Effect.runSync(
          withMapConfigProvider(map)(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          )
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.none(),
            VERSION: Option.none(),
          })
        );
      });
      it('[When] map entries are set with `DEBUG_OVERRIDE_` prefix', () => {
        const map = new Map([
          ['DEBUG_OVERRIDE_UPGRADE_TARGET', 'upgrade_target'],
          ['DEBUG_OVERRIDE_VERSION', 'x.x.x'],
        ]) satisfies Map<string, string>;

        const actual = Effect.runSync(
          withMapConfigProvider(map)(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          )
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.some('upgrade_target'),
            VERSION: Option.some('x.x.x'),
          })
        );
      });
    });
  });

  describe('[When] using `ConfigProvider.env`', () => {
    const withEnvConfigProvider = Effect.withConfigProvider(
      extendConfigProvider(ConfigProvider.fromEnv())
    );

    describe('APP_CONFIG', () => {
      it('[When] no env variable is set', () => {
        const actual = Effect.runSync(
          withEnvConfigProvider(Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            API_KEY: Option.none(),
            BASE_URL: Option.none(),
            CACHE_DIR: Option.none(),
            LOG_LEVEL: Option.none(),
          })
        );
      });

      it('[When] env variables are set without `COMPOSIO_` prefix', () => {
        vi.stubEnv('API_KEY', 'api_key');
        vi.stubEnv('BASE_URL', 'https://test.localhost');
        vi.stubEnv('CACHE_DIR', '~/.composio');
        vi.stubEnv('LOG_LEVEL', 'info');

        const actual = Effect.runSync(
          withEnvConfigProvider(Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            API_KEY: Option.none(),
            BASE_URL: Option.none(),
            CACHE_DIR: Option.none(),
            LOG_LEVEL: Option.none(),
          })
        );
      });

      it('[When] env variables are set with `COMPOSIO_` prefix', () => {
        vi.stubEnv('COMPOSIO_API_KEY', 'api_key');
        vi.stubEnv('COMPOSIO_BASE_URL', 'https://test.localhost');
        vi.stubEnv('COMPOSIO_CACHE_DIR', '~/.composio');
        vi.stubEnv('COMPOSIO_LOG_LEVEL', 'info');

        const actual = Effect.runSync(
          withEnvConfigProvider(Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            API_KEY: Option.some('api_key'),
            BASE_URL: Option.some('https://test.localhost'),
            CACHE_DIR: Option.some('~/.composio'),
            LOG_LEVEL: Option.some(LogLevel.Info),
          })
        );
      });
    });

    describe('DEBUG_OVERRIDE_CONFIG', () => {
      it('[When] no env variable is set', () => {
        const actual = Effect.runSync(
          withEnvConfigProvider(Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.none(),
            VERSION: Option.none(),
          })
        );
      });

      it('[When] env variables are set without `DEBUG_OVERRIDE_` prefix', () => {
        vi.stubEnv('UPGRADE_TARGET', 'upgrade_target');
        vi.stubEnv('VERSION', 'x.x.x');

        const actual = Effect.runSync(
          withEnvConfigProvider(Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.none(),
            VERSION: Option.none(),
          })
        );
      });

      it('[When] env variables are set without `DEBUG_OVERRIDE_` but with `COMPOSIO_` prefix', () => {
        vi.stubEnv('COMPOSIO_UPGRADE_TARGET', 'upgrade_target');
        vi.stubEnv('COMPOSIO_VERSION', 'x.x.x');

        const actual = Effect.runSync(
          withEnvConfigProvider(Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.none(),
            VERSION: Option.none(),
          })
        );
      });

      it('[When] env variables are set with `DEBUG_OVERRIDE_` prefix', () => {
        vi.stubEnv('DEBUG_OVERRIDE_UPGRADE_TARGET', 'upgrade_target');
        vi.stubEnv('DEBUG_OVERRIDE_VERSION', 'x.x.x');

        const actual = Effect.runSync(
          withEnvConfigProvider(Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct)))
        );

        assertEquals(
          actual,
          Data.struct({
            UPGRADE_TARGET: Option.some('upgrade_target'),
            VERSION: Option.some('x.x.x'),
          })
        );
      });
    });
  });
});
