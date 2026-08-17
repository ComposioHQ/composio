import { FileSystem, Path } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Context, Effect, Layer, Option, Predicate, Schema } from 'effect';
import type { ParseError } from 'effect/ParseResult';
// eslint-disable-next-line no-restricted-imports -- os.homedir feeds resolveCliConfigDirectorySync, which runs from synchronous non-Effect call sites (dev.cmd messages, run-helpers-runtime readFileSync) where the NodeOs service is unavailable
import os from 'node:os';
import { JsonRecordSchema } from 'src/effects/json';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { getVersion } from 'src/effects/version';
import {
  CliUserConfig,
  cliUserConfigFromJSON,
  cliUserConfigToJSON,
  OnboardingConfig,
} from 'src/models/cli-user-config';
import type { OnboardingLastExecution } from 'src/models/cli-user-config';
import { isExperimentalFeatureEnabledByDefault } from 'src/experimental-features';
import * as constants from 'src/constants';
import type { CliReleaseChannel } from 'src/constants';

export type CliUserConfigResolved = {
  readonly channel: CliReleaseChannel;
  readonly developerModeEnabled: boolean;
  readonly developerDangerousCommandsEnabled: boolean;
  readonly experimentalFeatures: Readonly<Record<string, boolean>>;
  readonly artifactDirectory: string | undefined;
  readonly experimentalSubagentTarget: 'auto' | 'claude' | 'codex';
  /**
   * Where the CLI stores the Composio API key. See the
   * `SecurityBackend` type in `src/models/cli-user-config.ts`.
   * Default: `"auto"` (plaintext `user_data.json`, backwards-compatible
   * with every prior CLI release).
   */
  readonly security: 'auto' | 'json' | 'keychain-subprocess' | 'keychain';
  /**
   * Durable onboarding facts. `hasExecuted` is the execute gate of `composio onboard`; it is
   * written by the shared execute path, so `composio execute` on its own satisfies the gate.
   */
  readonly onboarding: {
    readonly hasExecuted: boolean;
    readonly lastExecution: OnboardingLastExecution | undefined;
  };
};

const detectReleaseChannel = (version: string): CliReleaseChannel =>
  /-[0-9A-Za-z.-]+$/.test(version) ? 'beta' : 'stable';

const DEFAULT_CLI_USER_CONFIG = CliUserConfig.make({
  developer: {
    enabled: true,
    destructiveActions: false,
  },
  experimentalFeatures: {},
  artifactDirectory: Option.none(),
  experimentalSubagent: Option.none(),
  security: 'auto',
  onboarding: OnboardingConfig.make({
    hasExecuted: false,
    lastExecution: Option.none(),
  }),
});

const decodeConfigJson = Schema.decodeUnknown(Schema.parseJson(JsonRecordSchema));

// The sync resolvers below run from non-Effect call sites (the
// run-helpers-runtime child process), so the Path service is materialized once
// from its pure default layer instead of being yielded from context.
const syncPath = Effect.runSync(Path.Path.pipe(Effect.provide(Path.layer)));

export const resolveCliConfigDirectorySync = (): string =>
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- this resolver is called from synchronous non-Effect code, so the COMPOSIO_CACHE_DIR override cannot come from effect/Config here
  process.env.COMPOSIO_CACHE_DIR?.trim() ||
  syncPath.join(os.homedir(), constants.USER_COMPOSIO_DIR);

export const resolveCliConfigPathSync = (): string =>
  syncPath.join(resolveCliConfigDirectorySync(), constants.CLI_CONFIG_FILE_NAME);

/**
 * Effect-based resolver for the CLI config file path. Prefer this over
 * `resolveCliConfigPathSync` inside Effect-hosted code: it honors the
 * COMPOSIO_CACHE_DIR override via `effect/Config` and the NodeOs service.
 */
export const resolveCliConfigPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const configDir = yield* setupCacheDir;
  return path.join(configDir, constants.CLI_CONFIG_FILE_NAME);
});

export class ComposioCliUserConfig extends Context.Tag('ComposioCliUserConfig')<
  ComposioCliUserConfig,
  {
    readonly data: CliUserConfigResolved;
    readonly raw: CliUserConfig;
    readonly channel: CliReleaseChannel;
    readonly isDevModeEnabled: () => boolean;
    readonly areDeveloperDangerousCommandsEnabled: () => boolean;
    readonly isExperimentalFeatureEnabled: (feature: string) => boolean;
    readonly update: (
      next: Partial<CliUserConfig>
    ) => Effect.Effect<void, ParseError | PlatformError, never>;
  }
>() {}

const resolveConfig = (raw: CliUserConfig, channel: CliReleaseChannel): CliUserConfigResolved => ({
  channel,
  developerModeEnabled: raw.developer.enabled,
  developerDangerousCommandsEnabled: raw.developer.destructiveActions,
  experimentalFeatures: raw.experimentalFeatures,
  artifactDirectory: Option.getOrUndefined(raw.artifactDirectory),
  experimentalSubagentTarget: Option.match(raw.experimentalSubagent, {
    onNone: () => 'auto',
    onSome: value => value.target,
  }),
  security: raw.security,
  onboarding: {
    hasExecuted: raw.onboarding.hasExecuted,
    lastExecution: Option.getOrUndefined(raw.onboarding.lastExecution),
  },
});

export const ComposioCliUserConfigLive = Layer.effect(
  ComposioCliUserConfig,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const version = yield* getVersion;
    const channel = detectReleaseChannel(version);
    const jsonConfigPath = yield* resolveCliConfigPath;

    let rawConfig = DEFAULT_CLI_USER_CONFIG;

    const normalizeRawConfigJson = (value: unknown): unknown => {
      if (!Predicate.isRecord(value)) {
        return value;
      }

      const record = { ...value };
      const existingDeveloper = Predicate.isRecord(record.developer) ? { ...record.developer } : {};

      if (!('enabled' in existingDeveloper) && 'developer_mode_enabled' in record) {
        existingDeveloper.enabled = record.developer_mode_enabled;
      }
      if (
        !('destructive_actions' in existingDeveloper) &&
        'developer_dangerous_commands_enabled' in record
      ) {
        existingDeveloper.destructive_actions = record.developer_dangerous_commands_enabled;
      }

      delete record.developer_mode_enabled;
      delete record.developer_dangerous_commands_enabled;

      record.developer = existingDeveloper;
      return record;
    };

    const persist = (next: CliUserConfig) =>
      Effect.gen(function* () {
        const encoded = yield* cliUserConfigToJSON(next);
        yield* fs.writeFileString(jsonConfigPath, encoded);
        rawConfig = next;
      });

    const load = Effect.gen(function* () {
      const configJson = yield* fs.readFileString(jsonConfigPath, 'utf8');
      const parsed = yield* decodeConfigJson(configJson);
      rawConfig = yield* cliUserConfigFromJSON(JSON.stringify(normalizeRawConfigJson(parsed)));
      return rawConfig;
    });

    /**
     * Merge over what is on disk *now*, not over the snapshot this process loaded at startup.
     *
     * `~/.composio/config.json` is shared by every `composio` process on the machine, and the whole
     * file is rewritten on each write. Merging over the startup snapshot means a process that has
     * been running for a while reverts every unrelated field another process changed in the
     * meantime — `developer`, `experimentalFeatures`, `security`. Re-reading first narrows that
     * window to the read-merge-write itself. A file that has since become unreadable or undecodable
     * falls back to the in-memory config, which is the same value the old behavior would have used.
     *
     * TODO: the remaining window is still a real race — two processes can both read, both merge,
     * and the second write wins; a reader that lands on the truncated file resets the config to
     * defaults. Closing it needs an advisory cross-process lock around read-modify-write plus an
     * atomic rename, which is a change to every writer of this file and to the failure semantics of
     * a locked config, so it is deliberately not part of this change.
     */
    const update = (
      next: Partial<CliUserConfig>
    ): Effect.Effect<void, ParseError | PlatformError, never> =>
      Effect.gen(function* () {
        const current = yield* load.pipe(Effect.catchAll(() => Effect.succeed(rawConfig)));

        yield* persist(
          CliUserConfig.make(
            {
              ...current,
              ...next,
            },
            // A key this binary's schema does not declare belongs to a newer one that wrote the
            // file, and `.make`'s validation would strip it on the way back out. `current` was
            // validated when it was decoded and `next` is schema-shaped at the type level, so
            // nothing else is lost. The encoder preserves the same keys — see `cliUserConfigToJSON`.
            { disableValidation: true }
          )
        );
      });

    if (yield* fs.exists(jsonConfigPath)) {
      yield* load.pipe(Effect.catchAll(() => persist(DEFAULT_CLI_USER_CONFIG)));
    } else {
      yield* persist(rawConfig);
    }

    const isExperimentalFeatureEnabled = (feature: string) => {
      const configured = resolveConfig(rawConfig, channel).experimentalFeatures[feature];
      return configured ?? isExperimentalFeatureEnabledByDefault(feature, channel);
    };

    return ComposioCliUserConfig.of({
      get data() {
        return resolveConfig(rawConfig, channel);
      },
      get raw() {
        return rawConfig;
      },
      channel,
      isDevModeEnabled: () => resolveConfig(rawConfig, channel).developerModeEnabled,
      areDeveloperDangerousCommandsEnabled: () =>
        resolveConfig(rawConfig, channel).developerDangerousCommandsEnabled,
      isExperimentalFeatureEnabled,
      update,
    });
  })
);
