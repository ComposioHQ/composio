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
