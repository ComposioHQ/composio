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
import * as constants from 'src/constants';

export type CliReleaseChannel = 'stable' | 'beta';

export type CliUserConfigResolved = {
  readonly channel: CliReleaseChannel;
  readonly experimentalFeatures: Readonly<Record<string, boolean>>;
  readonly artifactDirectory: string | undefined;
  readonly experimentalSubagentTarget: 'auto' | 'claude' | 'codex';
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
    readonly isExperimentalFeatureEnabled: (feature: string) => boolean;
    readonly update: (
      next: Partial<CliUserConfig>
    ) => Effect.Effect<void, ParseError | PlatformError, never>;
  }
>() {}

const resolveConfig = (raw: CliUserConfig, channel: CliReleaseChannel): CliUserConfigResolved => ({
  channel,
  experimentalFeatures: raw.experimentalFeatures,
  artifactDirectory: Option.getOrUndefined(raw.artifactDirectory),
  experimentalSubagentTarget: Option.match(raw.experimentalSubagent, {
    onNone: () => 'auto',
    onSome: value => value.target,
  }),
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
      experimentalFeatures: {},
      artifactDirectory: Option.none(),
      experimentalSubagent: Option.none(),
    });

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
      rawConfig = yield* cliUserConfigFromJSON(configJson);
      return rawConfig;
    });

    if (yield* fs.exists(jsonConfigPath)) {
      yield* load.pipe(
        Effect.catchAll(() =>
          persist(
            CliUserConfig.make({
              experimentalFeatures: {},
              artifactDirectory: Option.none(),
              experimentalSubagent: Option.none(),
            })
          )
        )
      );
    } else {
      yield* persist(rawConfig);
    }

    const isExperimentalFeatureEnabled = (feature: string) => {
      const configured = resolveConfig(rawConfig, channel).experimentalFeatures[feature];
      return configured ?? channel === 'beta';
    };

    return ComposioCliUserConfig.of({
      get data() {
        return resolveConfig(rawConfig, channel);
      },
      get raw() {
        return rawConfig;
      },
      channel,
      isExperimentalFeatureEnabled,
      update,
    });
  })
);
