import { Option, Effect, ConfigProvider, Layer, References } from 'effect';
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
 * COMPOSIO_USER_API_KEY=your_user_api_key
 * ```
 *
 * Read via `yield* Config.string('USER_API_KEY')`.
 */

/**
 * Builds a fresh `ConfigProvider` backed by the current process environment.
 *
 * This MUST be constructed lazily (a function, not a memoized module-level
 * constant): `ConfigProvider.fromEnv()` snapshots `process.env` into an
 * internal trie at construction time, so a module-level constant would freeze
 * the environment as of first import and never observe later env var changes
 * (e.g. `vi.stubEnv` in tests, or any other in-process env mutation).
 */
export function getBaseConfigProvider(): ConfigProvider.ConfigProvider {
  return ConfigProvider.fromEnv();
}

export function extendConfigProvider(baseConfigProvider: ConfigProvider.ConfigProvider) {
  return baseConfigProvider.pipe(
    ConfigProvider.mapInput(path =>
      path.map(segment => {
        if (typeof segment !== 'string') {
          return segment;
        }
        if (segment.startsWith('DEBUG_OVERRIDE_') || segment.startsWith('FORCE_')) {
          return segment;
        }
        return `${constants.APP_ENV_CONFIG_KEY_PREFIX}${segment}`;
      })
    )
  );
}

/**
 * Tentatively set the minimum log level if found in the config.
 */
const LoggerFromConfigLive = Effect.map(
  APP_CONFIG['LOG_LEVEL'],
  Option.match({
    onNone: () => Layer.empty,
    onSome: logLevel => Layer.succeed(References.MinimumLogLevel, logLevel),
  })
).pipe(Layer.unwrap);

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
