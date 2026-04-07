import path from 'node:path';
import * as tempy from 'tempy';
import fs from 'node:fs';
import { describe, it } from '@effect/vitest';
import { assertEquals } from '@effect/vitest/utils';
import { FileSystem } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import {
  ComposioCliUserConfig,
  ComposioCliUserConfigLive,
  resolveCliConfigPathSync,
} from 'src/services/cli-user-config';

describe('ComposioCliUserConfig', () => {
  const withMapConfigProvider = (map: Map<string, string>) =>
    Layer.setConfigProvider(extendConfigProvider(ConfigProvider.fromMap(map)));

  it.scoped('defaults experimental features off in stable releases', () => {
    const cwd = tempy.temporaryDirectory();
    const map = new Map([['DEBUG_OVERRIDE_VERSION', '1.2.3']]) satisfies Map<string, string>;
    const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
    const CliUserConfigTest = Layer.provideMerge(
      ComposioCliUserConfigLive,
      Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
    );

    return Effect.gen(function* () {
      const config = yield* ComposioCliUserConfig;
      assertEquals(config.channel, 'stable');
      assertEquals(config.data.experimentalFeatures.listen, undefined);
      assertEquals(config.isExperimentalFeatureEnabled('listen'), false);
      assertEquals(config.data.experimentalSubagentTarget, 'auto');
      assertEquals(config.data.artifactDirectory, undefined);

      const fs = yield* FileSystem.FileSystem;
      assertEquals(yield* fs.exists(path.join(cwd, '.composio', 'config.json')), true);
    }).pipe(Effect.provide(CliUserConfigTest));
  });

  it.scoped('defaults experimental features on in beta releases', () => {
    const cwd = tempy.temporaryDirectory();
    const map = new Map([['DEBUG_OVERRIDE_VERSION', '1.2.3-beta.4']]) satisfies Map<string, string>;
    const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
    const CliUserConfigTest = Layer.provideMerge(
      ComposioCliUserConfigLive,
      Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
    );

    return Effect.gen(function* () {
      const config = yield* ComposioCliUserConfig;
      assertEquals(config.channel, 'beta');
      assertEquals(config.data.experimentalFeatures.listen, undefined);
      assertEquals(config.isExperimentalFeatureEnabled('listen'), true);
      assertEquals(config.data.experimentalSubagentTarget, 'auto');
    }).pipe(Effect.provide(CliUserConfigTest));
  });

  it.scoped('respects explicit persisted cli settings from config.json', () => {
    const cwd = tempy.temporaryDirectory();
    const map = new Map([['DEBUG_OVERRIDE_VERSION', '1.2.3-beta.4']]) satisfies Map<string, string>;
    fs.mkdirSync(path.join(cwd, '.composio'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.composio', 'config.json'),
      JSON.stringify({
        experimental_features: {
          listen: false,
        },
        artifact_directory: '/tmp/composio-artifacts',
        experimental_subagent: {
          target: 'claude',
        },
      })
    );

    const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd }));
    const CliUserConfigTest = Layer.provideMerge(
      ComposioCliUserConfigLive,
      Layer.mergeAll(BunFileSystem.layer, NodeOsTest, withMapConfigProvider(map))
    );

    return Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const config = yield* ComposioCliUserConfig;
      assertEquals(config.data.experimentalFeatures.listen, false);
      assertEquals(config.isExperimentalFeatureEnabled('listen'), false);
      assertEquals(config.data.artifactDirectory, '/tmp/composio-artifacts');
      assertEquals(config.data.experimentalSubagentTarget, 'claude');

      const persisted = yield* fileSystem.readFileString(
        path.join(cwd, '.composio', 'config.json'),
        'utf8'
      );
      const parsed = JSON.parse(persisted) as {
        experimental_features: { listen: boolean };
        artifact_directory: string;
        experimental_subagent: { target: string };
      };

      assertEquals(parsed.experimental_features.listen, false);
      assertEquals(parsed.artifact_directory, '/tmp/composio-artifacts');
      assertEquals(parsed.experimental_subagent.target, 'claude');
    }).pipe(Effect.provide(CliUserConfigTest));
  });
  it.effect('resolves sync config path from COMPOSIO_CACHE_DIR when provided', () => {
    const cacheDir = tempy.temporaryDirectory();
    process.env.COMPOSIO_CACHE_DIR = cacheDir;

    return Effect.sync(() => {
      try {
        assertEquals(resolveCliConfigPathSync(), path.join(cacheDir, 'config.json'));
      } finally {
        delete process.env.COMPOSIO_CACHE_DIR;
      }
    });
  });
});
