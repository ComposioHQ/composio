import { Schema } from 'effect';
import { OptionFromNullishOr } from 'effect/Schema';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const ExperimentalSubagentTarget = Schema.Literal('auto', 'claude', 'codex');
export type ExperimentalSubagentTarget = Schema.Schema.Type<typeof ExperimentalSubagentTarget>;

/**
 * Where the CLI stores the Composio API key.
 *
 *  - `"auto"` (default): the OS credential store, via
 *    `/usr/bin/security` (macOS) or `secret-tool` (Linux). Adds ~25ms
 *    to startup (memoized for the process) and prompts for nothing —
 *    `/usr/bin/security` is Apple-signed and trusted. When the store
 *    is unavailable (headless Linux, containers, a locked keychain),
 *    the CLI falls back to a plaintext `user_data.json` key so
 *    authentication keeps working. An existing plaintext key is
 *    migrated on the next run, and is only removed once the secure
 *    write has succeeded.
 *  - `"json"`: pin the API key to plaintext `user_data.json`, with no
 *    credential-store access on load, login, or update. Logout still
 *    cleans up a credential left behind by an earlier keyring-backed
 *    mode.
 *  - `"keychain-subprocess"`: identical to `"auto"` today. Kept so
 *    configs that pinned it before `"auto"` became keyring-backed
 *    continue to work.
 *  - `"keychain"` (experimental): direct Security.framework FFI
 *    (~1ms reads). Currently triggers a macOS keychain trust dialog
 *    on unsigned / ad-hoc signed binaries — avoid unless the
 *    composio binary is signed with a stable Developer ID
 *    certificate. Linux is identical to `"keychain-subprocess"`
 *    (there's no FFI backend for libsecret).
 */
export const SecurityBackend = Schema.Literal('auto', 'json', 'keychain-subprocess', 'keychain');
export type SecurityBackend = Schema.Schema.Type<typeof SecurityBackend>;

export const ExperimentalFeatures = Schema.Record({
  key: Schema.String,
  value: Schema.Boolean,
});
export type ExperimentalFeatures = Schema.Schema.Type<typeof ExperimentalFeatures>;

export const DeveloperConfig = Schema.Struct({
  enabled: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
  destructiveActions: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }).pipe(Schema.fromKey('destructive_actions')),
});
export type DeveloperConfig = Schema.Schema.Type<typeof DeveloperConfig>;

export const CliUserConfig = Schema.Struct({
  developer: Schema.optionalWith(DeveloperConfig, {
    default: () =>
      DeveloperConfig.make({
        enabled: true,
        destructiveActions: false,
      }),
  }),
  experimentalFeatures: Schema.optionalWith(ExperimentalFeatures, {
    default: () => ({}),
  }).pipe(Schema.fromKey('experimental_features')),
  artifactDirectory: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('artifact_directory')
  ),
  experimentalSubagent: Schema.propertySignature(
    OptionFromNullishOr(
      Schema.Struct({
        target: ExperimentalSubagentTarget,
      }),
      null
    )
  ).pipe(Schema.fromKey('experimental_subagent')),
  /**
   * Where the CLI stores the Composio API key. See the
   * `SecurityBackend` type above for semantics. Default: `"auto"`
   * (the OS credential store, falling back to plaintext
   * `user_data.json` when no store is available).
   */
  security: Schema.optionalWith(SecurityBackend, {
    default: (): SecurityBackend => 'auto',
  }),
}).annotations({
  identifier: 'CliUserConfig',
  description: 'Named user configuration storage for the Composio CLI',
});

export type CliUserConfig = Schema.Schema.Type<typeof CliUserConfig>;

export const CliUserConfigJSON = JSONTransformSchema(CliUserConfig);
export const cliUserConfigFromJSON = Schema.decode(CliUserConfigJSON, {
  propertyOrder: 'original',
  onExcessProperty: 'preserve',
  exact: false,
});
export const cliUserConfigToJSON = Schema.encode(CliUserConfigJSON);
