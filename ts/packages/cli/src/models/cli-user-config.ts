import { Schema } from 'effect';
import { OptionFromNullishOr } from 'effect/Schema';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const ExperimentalSubagentTarget = Schema.Literal('auto', 'claude', 'codex');
export type ExperimentalSubagentTarget = Schema.Schema.Type<typeof ExperimentalSubagentTarget>;

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
