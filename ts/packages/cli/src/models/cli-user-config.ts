import { Schema } from 'effect';
import { OptionFromNullishOr } from 'effect/Schema';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const ExperimentalSubagentTarget = Schema.Literal('auto', 'claude', 'codex');
export type ExperimentalSubagentTarget = Schema.Schema.Type<typeof ExperimentalSubagentTarget>;

/**
 * Where the CLI stores the Composio API key.
 *
 *  - `"auto"` (default): plaintext `user_data.json`. Backwards-
 *    compatible with every prior CLI release — upgrading does not
 *    change where the key is stored, and no migration or keychain
 *    access is attempted. Lets users harden security explicitly by
 *    picking one of the keyring options below.
 *  - `"json"`: explicit opt-in to plaintext `user_data.json`. Pins
 *    the behavior so a future default change won't affect configs
 *    that set this value.
 *  - `"keychain-subprocess"`: store the API key in the OS credential
 *    store via `/usr/bin/security` (macOS) or `secret-tool` (Linux).
 *    Adds ~25ms to startup (memoized for the process). No macOS
 *    dialogs — `/usr/bin/security` is Apple-signed and trusted.
 *    Opt-in hardening for users who want the key out of plaintext.
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
   * (plaintext `user_data.json`, same as every prior CLI release —
   * no behavior change on upgrade).
   */
  security: Schema.optionalWith(SecurityBackend, {
    default: () => 'auto' as const,
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
