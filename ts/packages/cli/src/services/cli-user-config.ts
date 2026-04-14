import { FileSystem } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Context, Effect, Layer, Option } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import os from 'node:os';
import path from 'node:path';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { getVersion } from 'src/effects/version';
import {
  CliUserConfig,
  cliUserConfigFromJSON,
  cliUserConfigToJSON,
} from 'src/models/cli-user-config';
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
};

const detectReleaseChannel = (version: string): CliReleaseChannel =>
  /-[0-9A-Za-z.-]+$/.test(version) ? 'beta' : 'stable';

export const resolveCliConfigDirectorySync = (): string =>
  process.env.COMPOSIO_CACHE_DIR?.trim() || path.join(os.homedir(), constants.USER_COMPOSIO_DIR);

export const resolveCliConfigPathSync = (): string =>
  path.join(resolveCliConfigDirectorySync(), constants.CLI_CONFIG_FILE_NAME);

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
});

export const ComposioCliUserConfigLive = Layer.effect(
  ComposioCliUserConfig,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const version = yield* getVersion;
    const channel = detectReleaseChannel(version);
    const configDir = yield* setupCacheDir;
    const jsonConfigPath = path.join(configDir, constants.CLI_CONFIG_FILE_NAME);

    let rawConfig = CliUserConfig.make({
      developer: {
        enabled: true,
        destructiveActions: false,
      },
      experimentalFeatures: {},
      artifactDirectory: Option.none(),
      experimentalSubagent: Option.none(),
      security: 'auto',
    });

    const normalizeRawConfigJson = (value: unknown): unknown => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
      }

      const record = { ...(value as Record<string, unknown>) };
      const existingDeveloper =
        record.developer && typeof record.developer === 'object' && !Array.isArray(record.developer)
          ? { ...(record.developer as Record<string, unknown>) }
          : {};

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

    const update = (
      next: Partial<CliUserConfig>
    ): Effect.Effect<void, ParseError | PlatformError, never> =>
      persist(
        CliUserConfig.make({
          ...rawConfig,
          ...next,
        })
      );

    const load = Effect.gen(function* () {
      const configJson = yield* fs.readFileString(jsonConfigPath, 'utf8');
      rawConfig = yield* cliUserConfigFromJSON(
        JSON.stringify(normalizeRawConfigJson(JSON.parse(configJson)))
      );
      return rawConfig;
    });

    if (yield* fs.exists(jsonConfigPath)) {
      yield* load.pipe(
        Effect.catchAll(() =>
          persist(
            CliUserConfig.make({
              developer: {
                enabled: true,
                destructiveActions: false,
              },
              experimentalFeatures: {},
              artifactDirectory: Option.none(),
              experimentalSubagent: Option.none(),
              security: 'auto',
            })
          )
        )
      );
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
