import { Effect, Schema } from 'effect';
import { OptionFromOptionalNullOr } from 'effect/Schema';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const ExperimentalSubagentTarget = Schema.Literals(['auto', 'claude', 'codex']);
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
export const SecurityBackend = Schema.Literals(['auto', 'json', 'keychain-subprocess', 'keychain']);
export type SecurityBackend = Schema.Schema.Type<typeof SecurityBackend>;

export const ExperimentalFeatures = Schema.Record(Schema.String, Schema.Boolean);
export type ExperimentalFeatures = Schema.Schema.Type<typeof ExperimentalFeatures>;

export const DeveloperConfig = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(true))),
  destructiveActions: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
}).pipe(Schema.encodeKeys({ destructiveActions: 'destructive_actions' }));
export type DeveloperConfig = Schema.Schema.Type<typeof DeveloperConfig>;

export const CliUserConfig = Schema.Struct({
  developer: DeveloperConfig.pipe(
    Schema.withDecodingDefaultType(
      Effect.succeed(
        DeveloperConfig.make({
          enabled: true,
          destructiveActions: false,
        })
      )
    )
  ),
  experimentalFeatures: ExperimentalFeatures.pipe(
    Schema.withDecodingDefaultType(Effect.succeed({}))
  ),
  artifactDirectory: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),
  experimentalSubagent: OptionFromOptionalNullOr(
    Schema.Struct({
      target: ExperimentalSubagentTarget,
    }),
    { onNoneEncoding: null }
  ),
  /**
   * Where the CLI stores the Composio API key. See the
   * `SecurityBackend` type above for semantics. Default: `"auto"`
   * (plaintext `user_data.json`, same as every prior CLI release —
   * no behavior change on upgrade).
   */
  security: SecurityBackend.pipe(
    Schema.withDecodingDefaultType(Effect.succeed<SecurityBackend>('auto'))
  ),
}).pipe(
  Schema.encodeKeys({
    experimentalFeatures: 'experimental_features',
    artifactDirectory: 'artifact_directory',
    experimentalSubagent: 'experimental_subagent',
  }),
  Schema.annotate({
    identifier: 'CliUserConfig',
    description: 'Named user configuration storage for the Composio CLI',
  })
);

export type CliUserConfig = Schema.Schema.Type<typeof CliUserConfig>;

export const CliUserConfigJSON = JSONTransformSchema(CliUserConfig);
export const cliUserConfigFromJSON = Schema.decodeEffect(CliUserConfigJSON, {
  propertyOrder: 'original',
  onExcessProperty: 'preserve',
});
export const cliUserConfigToJSON = Schema.encodeEffect(CliUserConfigJSON);
