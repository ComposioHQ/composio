import { beforeEach, describe, it, vi } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';

import { Config, ConfigProvider, Effect, Option, Data, LogLevel } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';
import { extendConfigProvider } from 'src/services/config';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import * as constants from 'src/constants';

const NORMALIZED_APP_CONFIG_DEFAULTS = {
  CACHE_DIR: undefined,
  SESSION_DIR: undefined,
  BIN_DIR: undefined,
  AGENTS_BASE_URL: undefined,
  WEBHOOK_SECRET: undefined,
  CLI_INVOCATION_ORIGIN: undefined,
  CLI_PARENT_RUN_ID: undefined,
  RUN_ACP_ONLY: false,
  RUN_OUTPUT_DIR: undefined,
  PERF_DEBUG: false,
  TOOL_DEBUG: false,
};

describe('Config', () => {
  describe('[When] using `ConfigProvider.fromMap`', () => {
    const withMapConfigProvider = (map: Map<string, string>) =>
      Effect.withConfigProvider(extendConfigProvider(ConfigProvider.fromMap(map)));

    describe('APP_CONFIG', () => {
      it.effect('[When] no map entry is set', () =>
        Effect.gen(function* () {
          const map = new Map([]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://backend.composio.dev',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
              WEB_URL: 'https://dashboard.composio.dev/',
            })
          );
        })
      );

      it.effect('[When] map entries are set without `COMPOSIO_` prefix', () =>
        Effect.gen(function* () {
          const map = new Map([
            ['USER_API_KEY', 'api_key'],
            ['BASE_URL', 'https://test.localhost'],
            ['CACHE_DIR', '~/.composio'],
            ['LOG_LEVEL', 'info'],
          ]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://backend.composio.dev',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
              WEB_URL: 'https://dashboard.composio.dev/',
            })
          );
        })
      );

      it.effect('[When] env variables are set with `COMPOSIO_` prefix', () =>
        Effect.gen(function* () {
          const map = new Map([
            ['COMPOSIO_USER_API_KEY', 'api_key'],
            ['COMPOSIO_BASE_URL', 'https://test.localhost'],
            ['COMPOSIO_WEB_URL', 'https://test.localhost'],
            ['COMPOSIO_CACHE_DIR', '~/.composio'],
            ['COMPOSIO_SESSION_DIR', '/tmp/composio-sessions'],
            ['COMPOSIO_BIN_DIR', '/usr/local/bin'],
            ['COMPOSIO_LOG_LEVEL', 'info'],
            ['COMPOSIO_AGENTS_BASE_URL', 'https://agents.test.localhost'],
            ['COMPOSIO_WEBHOOK_SECRET', 'secret'],
            ['COMPOSIO_CLI_INVOCATION_ORIGIN', 'run'],
            ['COMPOSIO_CLI_PARENT_RUN_ID', 'run_parent'],
            ['COMPOSIO_RUN_ACP_ONLY', '1'],
            ['COMPOSIO_RUN_OUTPUT_DIR', '/tmp/composio-output'],
            ['COMPOSIO_PERF_DEBUG', '1'],
            ['COMPOSIO_TOOL_DEBUG', '1'],
          ]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.some('api_key'),
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://test.localhost',
              WEB_URL: 'https://test.localhost',
              CACHE_DIR: '~/.composio',
              SESSION_DIR: '/tmp/composio-sessions',
              BIN_DIR: '/usr/local/bin',
              LOG_LEVEL: Option.some(LogLevel.Info),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              AGENTS_BASE_URL: 'https://agents.test.localhost',
              WEBHOOK_SECRET: 'secret',
              CLI_INVOCATION_ORIGIN: 'run',
              CLI_PARENT_RUN_ID: 'run_parent',
              RUN_ACP_ONLY: true,
              RUN_OUTPUT_DIR: '/tmp/composio-output',
              PERF_DEBUG: true,
              TOOL_DEBUG: true,
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );

      it.effect('[When] optional directory values contain whitespace', () =>
        Effect.gen(function* () {
          const map = new Map([
            ['COMPOSIO_CACHE_DIR', '  /tmp/composio-cache  '],
            ['COMPOSIO_SESSION_DIR', '   '],
            ['COMPOSIO_BIN_DIR', '  /usr/local/bin  '],
            ['COMPOSIO_RUN_OUTPUT_DIR', '\t/tmp/composio-output\n'],
          ]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all({
              cacheDirectory: APP_CONFIG.CACHE_DIR,
              sessionDirectory: APP_CONFIG.SESSION_DIR,
              binDirectory: APP_CONFIG.BIN_DIR,
              runOutputDirectory: APP_CONFIG.RUN_OUTPUT_DIR,
            }).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              cacheDirectory: '/tmp/composio-cache',
              sessionDirectory: undefined,
              binDirectory: '/usr/local/bin',
              runOutputDirectory: '/tmp/composio-output',
            })
          );
        })
      );

      it.effect('[When] COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE is "false"', () =>
        Effect.gen(function* () {
          const map = new Map([
            ['COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE', 'false'],
          ]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://backend.composio.dev',
              WEB_URL: 'https://dashboard.composio.dev/',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: false,
            })
          );
        })
      );

      it.effect('[When] COMPOSIO_ENVIRONMENT is "production"', () =>
        Effect.gen(function* () {
          const map = new Map([['COMPOSIO_ENVIRONMENT', 'production']]) satisfies Map<
            string,
            string
          >;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.some('production'),
              BASE_URL: constants.DEFAULT_BASE_URL,
              WEB_URL: constants.DEFAULT_WEB_URL,
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );

      it.effect('[When] COMPOSIO_ENVIRONMENT is "staging"', () =>
        Effect.gen(function* () {
          const map = new Map([['COMPOSIO_ENVIRONMENT', 'staging']]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.some('staging'),
              BASE_URL: constants.STAGING_BASE_URL,
              WEB_URL: 'https://staging-dashboard.composio.dev/',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );

      it.effect(
        '[When] COMPOSIO_ENVIRONMENT is "staging" but explicit COMPOSIO_BASE_URL is set',
        () =>
          Effect.gen(function* () {
            const map = new Map([
              ['COMPOSIO_ENVIRONMENT', 'staging'],
              ['COMPOSIO_BASE_URL', 'https://custom-backend.localhost'],
            ]) satisfies Map<string, string>;

            const actual = yield* withMapConfigProvider(map)(
              Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
            );

            assertEquals(
              actual,
              Data.struct({
                USER_API_KEY: Option.none(),
                ...NORMALIZED_APP_CONFIG_DEFAULTS,
                ENVIRONMENT: Option.some('staging'),
                BASE_URL: 'https://custom-backend.localhost',
                WEB_URL: constants.STAGING_WEB_URL,
                LOG_LEVEL: Option.none(),
                ORG_ID: Option.none(),
                PROJECT_ID: Option.none(),
                DISABLE_CONNECTED_ACCOUNT_CACHE: true,
              })
            );
          })
      );

      it.effect(
        '[When] COMPOSIO_ENVIRONMENT is "staging" but explicit COMPOSIO_WEB_URL is set',
        () =>
          Effect.gen(function* () {
            const map = new Map([
              ['COMPOSIO_ENVIRONMENT', 'staging'],
              ['COMPOSIO_WEB_URL', 'https://custom-web.localhost'],
            ]) satisfies Map<string, string>;

            const actual = yield* withMapConfigProvider(map)(
              Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
            );

            assertEquals(
              actual,
              Data.struct({
                USER_API_KEY: Option.none(),
                ...NORMALIZED_APP_CONFIG_DEFAULTS,
                ENVIRONMENT: Option.some('staging'),
                BASE_URL: constants.STAGING_BASE_URL,
                WEB_URL: 'https://custom-web.localhost',
                LOG_LEVEL: Option.none(),
                ORG_ID: Option.none(),
                PROJECT_ID: Option.none(),
                DISABLE_CONNECTED_ACCOUNT_CACHE: true,
              })
            );
          })
      );

      it.effect('[When] COMPOSIO_ENVIRONMENT is an unknown value', () =>
        Effect.gen(function* () {
          const map = new Map([['COMPOSIO_ENVIRONMENT', 'unknown']]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.some('unknown'),
              BASE_URL: constants.DEFAULT_BASE_URL,
              WEB_URL: constants.DEFAULT_WEB_URL,
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );
    });

    describe('DEBUG_OVERRIDE_CONFIG', () => {
      it.effect('[When] no map entries variable is set', () =>
        Effect.gen(function* () {
          const map = new Map([]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              UPGRADE_TARGET: Option.none(),
              VERSION: Option.none(),
            })
          );
        })
      );

      it.effect('[When] map entries are set without `DEBUG_OVERRIDE_` prefix', () =>
        Effect.gen(function* () {
          const map = new Map([
            ['UPGRADE_TARGET', 'upgrade_target'],
            ['VERSION', 'x.x.x'],
          ]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              UPGRADE_TARGET: Option.none(),
              VERSION: Option.none(),
            })
          );
        })
      );

      it.effect(
        '[When] map entries are set without `DEBUG_OVERRIDE_` but with `COMPOSIO_` prefix',
        () =>
          Effect.gen(function* () {
            const map = new Map([
              ['COMPOSIO_UPGRADE_TARGET', 'upgrade_target'],
              ['COMPOSIO_VERSION', 'x.x.x'],
            ]) satisfies Map<string, string>;

            const actual = yield* withMapConfigProvider(map)(
              Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
            );

            assertEquals(
              actual,
              Data.struct({
                UPGRADE_TARGET: Option.none(),
                VERSION: Option.none(),
              })
            );
          })
      );
      it.effect('[When] map entries are set with `DEBUG_OVERRIDE_` prefix', () =>
        Effect.gen(function* () {
          const map = new Map([
            ['DEBUG_OVERRIDE_UPGRADE_TARGET', 'upgrade_target'],
            ['DEBUG_OVERRIDE_VERSION', 'x.x.x'],
          ]) satisfies Map<string, string>;

          const actual = yield* withMapConfigProvider(map)(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              UPGRADE_TARGET: Option.some('upgrade_target'),
              VERSION: Option.some('x.x.x'),
            })
          );
        })
      );
    });
  });

  describe('[When] using `ConfigProvider.env`', () => {
    const withEnvConfigProvider = Effect.withConfigProvider(
      extendConfigProvider(ConfigProvider.fromEnv())
    );

    // These cases assert what the config resolves from a clean environment,
    // but the developer's shell (direnv) and the shared vitest setup both
    // export COMPOSIO_* variables. Neutralize every APP_CONFIG input.
    beforeEach(() => {
      vi.stubEnv('COMPOSIO_USER_API_KEY', undefined);
      vi.stubEnv('COMPOSIO_ENVIRONMENT', undefined);
      vi.stubEnv('COMPOSIO_BASE_URL', undefined);
      vi.stubEnv('COMPOSIO_WEB_URL', undefined);
      vi.stubEnv('COMPOSIO_CACHE_DIR', undefined);
      vi.stubEnv('COMPOSIO_SESSION_DIR', undefined);
      vi.stubEnv('COMPOSIO_BIN_DIR', undefined);
      vi.stubEnv('COMPOSIO_LOG_LEVEL', undefined);
      vi.stubEnv('COMPOSIO_ORG_ID', undefined);
      vi.stubEnv('COMPOSIO_PROJECT_ID', undefined);
      vi.stubEnv('COMPOSIO_AGENTS_BASE_URL', undefined);
      vi.stubEnv('COMPOSIO_WEBHOOK_SECRET', undefined);
      vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', undefined);
      vi.stubEnv('COMPOSIO_CLI_PARENT_RUN_ID', undefined);
      vi.stubEnv('COMPOSIO_RUN_ACP_ONLY', undefined);
      vi.stubEnv('COMPOSIO_RUN_OUTPUT_DIR', undefined);
      vi.stubEnv('COMPOSIO_PERF_DEBUG', undefined);
      vi.stubEnv('COMPOSIO_TOOL_DEBUG', undefined);
      vi.stubEnv('COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE', undefined);
    });

    describe('APP_CONFIG', () => {
      it.effect('[When] no env variable is set', () =>
        Effect.gen(function* () {
          const actual = yield* withEnvConfigProvider(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://backend.composio.dev',
              WEB_URL: 'https://dashboard.composio.dev/',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );

      it.effect('[When] env variables are set without `COMPOSIO_` prefix', () =>
        Effect.gen(function* () {
          vi.stubEnv('USER_API_KEY', 'api_key');
          vi.stubEnv('BASE_URL', 'https://test.localhost');
          vi.stubEnv('CACHE_DIR', '~/.composio');
          vi.stubEnv('LOG_LEVEL', 'info');

          const actual = yield* withEnvConfigProvider(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://backend.composio.dev',
              WEB_URL: 'https://dashboard.composio.dev/',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );

      it.effect('[When] env variables are set with `COMPOSIO_` prefix', () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_USER_API_KEY', 'api_key');
          vi.stubEnv('COMPOSIO_BASE_URL', 'https://test.localhost');
          vi.stubEnv('COMPOSIO_WEB_URL', 'https://test.localhost');
          vi.stubEnv('COMPOSIO_CACHE_DIR', '~/.composio');
          vi.stubEnv('COMPOSIO_SESSION_DIR', '/tmp/composio-sessions');
          vi.stubEnv('COMPOSIO_BIN_DIR', '/usr/local/bin');
          vi.stubEnv('COMPOSIO_LOG_LEVEL', 'info');
          vi.stubEnv('COMPOSIO_AGENTS_BASE_URL', 'https://agents.test.localhost');
          vi.stubEnv('COMPOSIO_WEBHOOK_SECRET', 'secret');
          vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', 'run');
          vi.stubEnv('COMPOSIO_CLI_PARENT_RUN_ID', 'run_parent');
          vi.stubEnv('COMPOSIO_RUN_ACP_ONLY', '1');
          vi.stubEnv('COMPOSIO_RUN_OUTPUT_DIR', '/tmp/composio-output');
          vi.stubEnv('COMPOSIO_PERF_DEBUG', '1');
          vi.stubEnv('COMPOSIO_TOOL_DEBUG', '1');

          const actual = yield* withEnvConfigProvider(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.some('api_key'),
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://test.localhost',
              WEB_URL: 'https://test.localhost',
              CACHE_DIR: '~/.composio',
              SESSION_DIR: '/tmp/composio-sessions',
              BIN_DIR: '/usr/local/bin',
              LOG_LEVEL: Option.some(LogLevel.Info),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              AGENTS_BASE_URL: 'https://agents.test.localhost',
              WEBHOOK_SECRET: 'secret',
              CLI_INVOCATION_ORIGIN: 'run',
              CLI_PARENT_RUN_ID: 'run_parent',
              RUN_ACP_ONLY: true,
              RUN_OUTPUT_DIR: '/tmp/composio-output',
              PERF_DEBUG: true,
              TOOL_DEBUG: true,
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );

      it.effect('[When] COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE is "false"', () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE', 'false');

          const actual = yield* withEnvConfigProvider(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.none(),
              BASE_URL: 'https://backend.composio.dev',
              WEB_URL: 'https://dashboard.composio.dev/',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: false,
            })
          );
        })
      );

      it.effect('[When] COMPOSIO_ENVIRONMENT is "staging"', () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_ENVIRONMENT', 'staging');

          const actual = yield* withEnvConfigProvider(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.some('staging'),
              BASE_URL: constants.STAGING_BASE_URL,
              WEB_URL: 'https://staging-dashboard.composio.dev/',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );

      it.effect('[When] COMPOSIO_ENVIRONMENT is "staging" but explicit URLs override', () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_ENVIRONMENT', 'staging');
          vi.stubEnv('COMPOSIO_BASE_URL', 'https://custom.localhost');
          vi.stubEnv('COMPOSIO_WEB_URL', 'https://custom-web.localhost');

          const actual = yield* withEnvConfigProvider(
            Config.all(APP_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              USER_API_KEY: Option.none(),
              ...NORMALIZED_APP_CONFIG_DEFAULTS,
              ENVIRONMENT: Option.some('staging'),
              BASE_URL: 'https://custom.localhost',
              WEB_URL: 'https://custom-web.localhost',
              LOG_LEVEL: Option.none(),
              ORG_ID: Option.none(),
              PROJECT_ID: Option.none(),
              DISABLE_CONNECTED_ACCOUNT_CACHE: true,
            })
          );
        })
      );
    });

    describe('DEBUG_OVERRIDE_CONFIG', () => {
      it.effect('[When] no env variable is set', () =>
        Effect.gen(function* () {
          const actual = yield* withEnvConfigProvider(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              UPGRADE_TARGET: Option.none(),
              VERSION: Option.none(),
            })
          );
        })
      );

      it.effect('[When] env variables are set without `DEBUG_OVERRIDE_` prefix', () =>
        Effect.gen(function* () {
          vi.stubEnv('UPGRADE_TARGET', 'upgrade_target');
          vi.stubEnv('VERSION', 'x.x.x');

          const actual = yield* withEnvConfigProvider(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              UPGRADE_TARGET: Option.none(),
              VERSION: Option.none(),
            })
          );
        })
      );

      it.effect(
        '[When] env variables are set without `DEBUG_OVERRIDE_` but with `COMPOSIO_` prefix',
        () =>
          Effect.gen(function* () {
            vi.stubEnv('COMPOSIO_UPGRADE_TARGET', 'upgrade_target');
            vi.stubEnv('COMPOSIO_VERSION', 'x.x.x');

            const actual = yield* withEnvConfigProvider(
              Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
            );

            assertEquals(
              actual,
              Data.struct({
                UPGRADE_TARGET: Option.none(),
                VERSION: Option.none(),
              })
            );
          })
      );

      it.effect('[When] env variables are set with `DEBUG_OVERRIDE_` prefix', () =>
        Effect.gen(function* () {
          vi.stubEnv('DEBUG_OVERRIDE_UPGRADE_TARGET', 'upgrade_target');
          vi.stubEnv('DEBUG_OVERRIDE_VERSION', 'x.x.x');

          const actual = yield* withEnvConfigProvider(
            Config.all(DEBUG_OVERRIDE_CONFIG).pipe(Effect.andThen(Data.struct))
          );

          assertEquals(
            actual,
            Data.struct({
              UPGRADE_TARGET: Option.some('upgrade_target'),
              VERSION: Option.some('x.x.x'),
            })
          );
        })
      );
    });
  });
});
