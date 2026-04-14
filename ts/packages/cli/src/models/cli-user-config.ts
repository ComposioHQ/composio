import { Schema } from 'effect';
import { OptionFromNullishOr } from 'effect/Schema';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const ExperimentalSubagentTarget = Schema.Literal('auto', 'claude', 'codex');
export type ExperimentalSubagentTarget = Schema.Schema.Type<typeof ExperimentalSubagentTarget>;

/**
 * How the CLI stores the Composio API key on macOS.
 *
 *  - `"auto"` (default): subprocess keychain — the only path that
 *    reliably avoids macOS trust dialogs for our ad-hoc signed
 *    binary. ~25ms startup overhead, memoized for the process.
 *  - `"keychain-subprocess"`: force the subprocess backend. Explicit
 *    alias for `"auto"` today; kept stable for configs that set it
 *    explicitly.
 *  - `"keychain"` (experimental): direct Security.framework FFI
 *    (~1ms reads). Currently triggers a keychain trust dialog on
 *    unsigned/ad-hoc signed binaries — avoid unless the composio
 *    binary is signed with a stable Developer ID certificate.
 *
 * Linux always uses `secret-tool` subprocess regardless of this
 * setting; libsecret's Secret Service has no per-binary ACL concept,
 * so an FFI backend would offer no benefit.
 */
export const SecurityBackend = Schema.Literal('auto', 'keychain-subprocess', 'keychain');
export type SecurityBackend = Schema.Schema.Type<typeof SecurityBackend>;

export const ExperimentalFeatures = Schema.Record({
  key: Schema.String,
  value: Schema.Boolean,
});
export type ExperimentalFeatures = Schema.Schema.Type<typeof ExperimentalFeatures>;

export const CliUserConfig = Schema.Struct({
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
   * Escape hatch that disables the OS keyring integration entirely and
   * stores the Composio API key as plaintext in `user_data.json`. Opt-in
   * only, intentionally undocumented in `--help` (users must edit
   * `config.json` by hand). Primary use cases:
   *
   *  - **Headless Linux** where `secret-tool` / D-Bus Secret Service is
   *    unavailable or unreliable (containers, CI, SSH without bus
   *    forwarding). Users who can't get the keyring working get a clean
   *    opt-out rather than fighting `DBUS_SESSION_BUS_ADDRESS`.
   *  - **CI / Docker / devcontainers** where ephemeral environments
   *    make the keyring absent or actively harmful.
   *
   * Naming follows React's `dangerouslySetInnerHTML` precedent — the
   * risk is explicit and visible in `cat config.json`. Default is
   * `false`: keyring first, fallback to plaintext only when the keyring
   * is actually unavailable.
   */
  dangerouslySaveApiKeyInUserConfig: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }).pipe(Schema.fromKey('dangerously_save_api_key_in_user_config')),
  /**
   * Experimental: which macOS keyring backend to use. See the
   * `SecurityBackend` type above for semantics. Default: `"auto"`.
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
