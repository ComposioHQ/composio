import path from 'node:path';
import fs from 'node:fs';
import * as tempy from 'tempy';
import { describe, expect, it } from '@effect/vitest';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer, Schema } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { ComposioCliUserConfig, ComposioCliUserConfigLive } from 'src/services/cli-user-config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { readPersistedOnboarding, recordSuccessfulOnboarding } from 'src/services/onboarding-store';

const JsonRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });
const decodeJsonRecord = Schema.decodeUnknownSync(Schema.parseJson(JsonRecord));

describe('onboarding store', () => {
  it.scoped('persists only the successful-demo boolean', () => {
    const cwd = tempy.temporaryDirectory();
    const configProvider = Layer.setConfigProvider(
      extendConfigProvider(ConfigProvider.fromMap(new Map([['DEBUG_OVERRIDE_VERSION', '1.2.3']])))
    );
    const configLayer = Layer.provideMerge(
      ComposioCliUserConfigLive,
      Layer.mergeAll(
        BunFileSystem.layer,
        BunPath.layer,
        Layer.succeed(NodeOs, defaultNodeOs({ homedir: cwd })),
        configProvider
      )
    );

    return Effect.gen(function* () {
      expect(yield* readPersistedOnboarding).toEqual({ hasExecuted: false });

      yield* recordSuccessfulOnboarding;

      const config = yield* ComposioCliUserConfig;
      expect(yield* readPersistedOnboarding).toEqual({ hasExecuted: true });
      expect(config.data.onboarding).toEqual({ hasExecuted: true });

      const persisted = decodeJsonRecord(
        fs.readFileSync(path.join(cwd, '.composio', 'config.json'), 'utf8')
      );
      expect(persisted.onboarding).toEqual({ has_executed: true });
    }).pipe(Effect.provide(configLayer));
  });
});
