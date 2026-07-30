/**
 * `ComposioUserContext` layer for tests.
 *
 * Always build the user context through this helper (or `TestLayer`).
 * The production `ComposioUserContextLive` hardcodes the real platform
 * keyring backend, so providing it from a test reads and writes the
 * developer's actual OS credential store.
 */

import { Effect, Layer, Option } from 'effect';
import { rawComposioUserContextLive } from 'src/services/user-context';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { CliUserConfig, type SecurityBackend } from 'src/models/cli-user-config';
import { makeFakeKeyring, type FakeKeyring } from './keyring';

/** Static `ComposioCliUserConfig` with only `security` varying. */
export const makeCliUserConfigLayer = (security: SecurityBackend = 'auto') =>
  Layer.succeed(
    ComposioCliUserConfig,
    ComposioCliUserConfig.of({
      data: {
        channel: 'beta',
        developerModeEnabled: true,
        developerDangerousCommandsEnabled: false,
        experimentalFeatures: {},
        artifactDirectory: undefined,
        experimentalSubagentTarget: 'auto',
        security,
      },
      raw: CliUserConfig.make({
        developer: { enabled: true, destructiveActions: false },
        experimentalFeatures: {},
        artifactDirectory: Option.none(),
        experimentalSubagent: Option.none(),
        security,
      }),
      channel: 'beta',
      isDevModeEnabled: () => true,
      areDeveloperDangerousCommandsEnabled: () => false,
      isExperimentalFeatureEnabled: () => true,
      update: () => Effect.void,
    })
  );

/**
 * Build `ComposioUserContext` over a fresh fake credential store.
 * Pass `keyring` when the test needs to seed a credential, script a
 * failure, or assert on the call log.
 */
export const makeUserContextLayer = (options?: {
  readonly keyring?: FakeKeyring;
  readonly security?: SecurityBackend;
}) =>
  Layer.provide(
    rawComposioUserContextLive,
    Layer.mergeAll(
      (options?.keyring ?? makeFakeKeyring()).layer,
      makeCliUserConfigLayer(options?.security ?? 'auto')
    )
  );
