import fs from 'node:fs';
import path from 'node:path';
import * as tempy from 'tempy';
import { describe, it } from '@effect/vitest';
import { assertEquals, assertTrue } from '@effect/vitest/utils';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { ComposioCliUserConfig, ComposioCliUserConfigLive } from 'src/services/cli-user-config';
import {
  clearOnboardingExecution,
  readPersistedOnboarding,
  recordSuccessfulExecution,
} from 'src/services/onboarding-store';

const CONFIG_VERSION = new Map([['DEBUG_OVERRIDE_VERSION', '1.2.3']]) satisfies Map<string, string>;

type PersistedConfigJson = {
  readonly onboarding?: {
    readonly has_executed?: boolean;
    readonly last_execution?: { readonly slug: string; readonly at: string } | null;
  };
};

const layerFor = (homedir: string) =>
  Layer.provideMerge(
    ComposioCliUserConfigLive,
    Layer.mergeAll(
      BunFileSystem.layer,
      BunPath.layer,
      Layer.succeed(NodeOs, defaultNodeOs({ homedir })),
      Layer.setConfigProvider(extendConfigProvider(ConfigProvider.fromMap(CONFIG_VERSION)))
    )
  );

const writeConfig = (homedir: string, contents: unknown) => {
  fs.mkdirSync(path.join(homedir, '.composio'), { recursive: true });
  fs.writeFileSync(path.join(homedir, '.composio', 'config.json'), JSON.stringify(contents));
};

const readConfig = (homedir: string): PersistedConfigJson =>
  JSON.parse(
    fs.readFileSync(path.join(homedir, '.composio', 'config.json'), 'utf8')
  ) as PersistedConfigJson;

describe('onboarding-store', () => {
  it.scoped('decodes a config with no onboarding key to the default', () => {
    const homedir = tempy.temporaryDirectory();
    writeConfig(homedir, { developer: { enabled: true } });

    return Effect.gen(function* () {
      const persisted = yield* readPersistedOnboarding;
      assertEquals(persisted.hasExecuted, false);
      assertEquals(persisted.lastExecution, undefined);
    }).pipe(Effect.provide(layerFor(homedir)));
  });

  it.scoped('round-trips last_execution through encode and decode', () => {
    const homedir = tempy.temporaryDirectory();

    return Effect.gen(function* () {
      yield* recordSuccessfulExecution({ slug: 'GITHUB_GET_THE_AUTHENTICATED_USER' });

      const persisted = yield* readPersistedOnboarding;
      assertEquals(persisted.hasExecuted, true);
      assertEquals(persisted.lastExecution?.slug, 'GITHUB_GET_THE_AUTHENTICATED_USER');
      assertTrue((persisted.lastExecution?.at ?? '').length > 0);

      const onDisk = readConfig(homedir).onboarding;
      assertEquals(onDisk?.has_executed, true);
      assertEquals(onDisk?.last_execution?.slug, 'GITHUB_GET_THE_AUTHENTICATED_USER');
    }).pipe(Effect.provide(layerFor(homedir)));
  });

  it.scoped('keeps the most recent execution and never flips has_executed back to false', () => {
    const homedir = tempy.temporaryDirectory();

    return Effect.gen(function* () {
      yield* recordSuccessfulExecution({ slug: 'FIRST_SLUG' });
      const first = yield* readPersistedOnboarding;

      yield* recordSuccessfulExecution({ slug: 'SECOND_SLUG' });
      const second = yield* readPersistedOnboarding;

      assertEquals(second.hasExecuted, true);
      assertEquals(second.lastExecution?.slug, 'SECOND_SLUG');
      assertTrue((second.lastExecution?.at ?? '') >= (first.lastExecution?.at ?? ''));
    }).pipe(Effect.provide(layerFor(homedir)));
  });

  it.scoped('ignores a pending_link / skipped block written by an older build', () => {
    const homedir = tempy.temporaryDirectory();
    writeConfig(homedir, {
      onboarding: {
        has_executed: true,
        last_execution: { slug: 'GMAIL_FETCH_EMAILS', at: '2026-01-01T00:00:00.000Z' },
        pending_link: { toolkit: 'github', connected_account_id: 'ca_1' },
        skipped: ['connect'],
      },
    });

    return Effect.gen(function* () {
      const persisted = yield* readPersistedOnboarding;
      assertEquals(persisted.hasExecuted, true);
      assertEquals(persisted.lastExecution?.slug, 'GMAIL_FETCH_EMAILS');
    }).pipe(Effect.provide(layerFor(homedir)));
  });

  it.scoped('falls back to the default config when onboarding is malformed', () => {
    const homedir = tempy.temporaryDirectory();
    writeConfig(homedir, { onboarding: 3 });

    return Effect.gen(function* () {
      const persisted = yield* readPersistedOnboarding;
      assertEquals(persisted.hasExecuted, false);
      assertEquals(persisted.lastExecution, undefined);
    }).pipe(Effect.provide(layerFor(homedir)));
  });

  it.scoped('clears the durable facts on reset', () => {
    const homedir = tempy.temporaryDirectory();

    return Effect.gen(function* () {
      yield* recordSuccessfulExecution({ slug: 'GITHUB_GET_THE_AUTHENTICATED_USER' });
      yield* clearOnboardingExecution;

      const persisted = yield* readPersistedOnboarding;
      assertEquals(persisted.hasExecuted, false);
      assertEquals(persisted.lastExecution, undefined);

      const onDisk = readConfig(homedir).onboarding;
      assertEquals(onDisk?.has_executed, false);
      assertEquals(onDisk?.last_execution, null);
    }).pipe(Effect.provide(layerFor(homedir)));
  });

  it.scoped('succeeds without persisting when the config directory is read-only', () => {
    const homedir = tempy.temporaryDirectory();

    return Effect.gen(function* () {
      const configDir = path.join(homedir, '.composio');
      fs.chmodSync(configDir, 0o500);

      const before = yield* readPersistedOnboarding;
      assertEquals(before.hasExecuted, false);

      // The write cannot land, but the caller sits on the success path of a tool execution
      // that already happened, so it must not observe a failure.
      yield* recordSuccessfulExecution({ slug: 'GITHUB_GET_THE_AUTHENTICATED_USER' });

      fs.chmodSync(configDir, 0o700);
    }).pipe(Effect.provide(layerFor(homedir)));
  });

  it.scoped('leaves unrelated config fields untouched when recording an execution', () => {
    const homedir = tempy.temporaryDirectory();
    writeConfig(homedir, {
      developer: { enabled: false, destructive_actions: true },
      artifact_directory: '/tmp/composio-artifacts',
    });

    return Effect.gen(function* () {
      yield* recordSuccessfulExecution({ slug: 'GITHUB_GET_THE_AUTHENTICATED_USER' });

      const config = yield* ComposioCliUserConfig;
      assertEquals(config.data.developerModeEnabled, false);
      assertEquals(config.data.developerDangerousCommandsEnabled, true);
      assertEquals(config.data.artifactDirectory, '/tmp/composio-artifacts');
      assertEquals(config.data.onboarding.hasExecuted, true);
    }).pipe(Effect.provide(layerFor(homedir)));
  });
});
