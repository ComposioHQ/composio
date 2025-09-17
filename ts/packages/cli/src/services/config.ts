import { Option, Effect, ConfigProvider, Layer, Logger } from 'effect';
import * as constants from 'src/constants';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import { APP_CONFIG } from 'src/effects/app-config';

/**
 * Define where `effect/Config` reads config values from.
 * Lookup priority:
 * 1. Environment variables
 *
 * Environment variables' keys are in upper snake case.
 * They are prefixed with `COMPOSIO_`, with the only exception of `DEBUG_OVERRIDE_*` and `FORCE_*` variables.
 * The prefix is stripped when reading the environment variables from `effect/Config`.
 *
 * @example
 * ```sh
 * # Environment variable
 * COMPOSIO_API_KEY=your_api_key
 * ```
 *
 * Read via `yield* Config.string('API_KEY')`.
 */

export const BaseConfigProviderLive = ConfigProvider.fromEnv();

export function extendConfigProvider(baseConfigProvider: ConfigProvider.ConfigProvider) {
  return baseConfigProvider.pipe(
    ConfigProvider.mapInputPath(key => {
      if (key.startsWith('DEBUG_OVERRIDE_') || key.startsWith('FORCE_')) {
        return key;
      }
      return `${constants.APP_ENV_CONFIG_KEY_PREFIX}${key}`;
    })
  );
}

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

export const ConfigLive = LoggerFromConfigLive.pipe(
  Layer.tap(() => logDebugOverride),
  Layer.tap(() => Effect.logDebug('ConfigLive layer initialized'))
);
