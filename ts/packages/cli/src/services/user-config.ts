import path from 'node:path';
import { Option, Effect, ConfigProvider, Layer, Logger } from 'effect';
import * as constants from 'src/constants';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import { configProviderFromLazyJson } from 'src/effects/from-lazy-json';
import { APP_CONFIG } from 'src/effects/app-config';
import { setupCacheDir } from 'src/effects/setup-cache-dir';

/**
 * Define where `effect/Config` reads config values from.
 * Lookup priority:
 * 1. Environment variables
 * 2. JSON user file (lazily loaded only when absolutely needed)
 *
 * Environment variables' keys are in upper snake case.
 * They are prefixed with `COMPOSIO_`, with the only exception of `DEBUG_*` variables.
 * The prefix is stripped when reading the environment variables from `effect/Config`.
 *
 * @example
 * ```sh
 * # Environment variable
 * COMPOSIO_API_KEY=your_api_key
 * ```
 *
 * ```jsonc
 * // JSON User config file
 * {
 *   "api_key": "your_api_key"
 * }
 * ```
 *
 * Read via `yield* Config.string('API_KEY')`.
 */
const ConfigProviderLive = Effect.gen(function* () {
  // TODO: fix this to avoid `API_KEY` errors when using commands that don't need it.
  const cacheDir = yield* setupCacheDir;
  const jsonUserConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);
  const configProviderFromUserFile = yield* configProviderFromLazyJson(jsonUserConfigPath);
  // const configProviderFromUserFile = yield* configProviderFromLazyJson('/tmp');

  // start by reading from env vars
  const configProvider = ConfigProvider.fromEnv()
    // prefix env var keys
    .pipe(
      ConfigProvider.mapInputPath(key => {
        if (key.startsWith('DEBUG_OVERRIDE_') || key.startsWith('FORCE_')) {
          return key;
        }

        return `${constants.APP_ENV_CONFIG_KEY_PREFIX}${key}`;
      })
    )
    // fall back to user config file, which is lazily loaded
    .pipe(
      ConfigProvider.orElse(() => {
        // e.g., read `json['api_key']` as `Config.string('COMPOSIO_API_KEY')`
        return configProviderFromUserFile.pipe(ConfigProvider.snakeCase);
      })
    );

  return Layer.setConfigProvider(configProvider);
}).pipe(Layer.unwrapEffect);

/**
 * Tentatively set the minimum log level if found in the config.
 */
const LoggerFromConfigLive = Effect.map(
  APP_CONFIG['LOG_LEVEL'],
  Option.match({
    onNone: () => Layer.empty,
    onSome: logLevel => Logger.minimumLogLevel(logLevel),
  })
).pipe(Layer.unwrapEffect);

/**
 * Print a debug message for each debug environment variable that overrides dynamic configuration values.
 */
const logDebugOverride = Effect.gen(function* () {
  const debugOverrideEntries = Object.keys(DEBUG_OVERRIDE_CONFIG) as [
    keyof typeof DEBUG_OVERRIDE_CONFIG,
  ];

  for (const key of debugOverrideEntries) {
    const configEntry = yield* DEBUG_OVERRIDE_CONFIG[key];
    if (Option.isSome(configEntry)) {
      yield* Effect.logDebug(
        `Using \`${constants.DEBUG_OVERRIDE_ENV_CONFIG_KEY_PREFIX}${key}\` debug override`
      );
    }
  }
});

export const UserConfigLive = Layer.provide(LoggerFromConfigLive, ConfigProviderLive).pipe(
  Layer.tap(() => logDebugOverride)
);
