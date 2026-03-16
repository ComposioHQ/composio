import { Schema } from 'effect';

/**
 * A trigger instance item from the list-active endpoint.
 * Field names match the raw API response (snake_case).
 */
export const TriggerInstanceItem = Schema.Struct({
  id: Schema.String,
  uuid: Schema.optionalWith(Schema.String, { default: () => '' }),
  trigger_name: Schema.optionalWith(Schema.String, { default: () => '' }),
  connected_account_id: Schema.optionalWith(Schema.String, { default: () => '' }),
  auth_config_id: Schema.optionalWith(Schema.String, { default: () => '' }),
  user_id: Schema.optionalWith(Schema.String, { default: () => '' }),
  disabled_at: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
  updated_at: Schema.optionalWith(Schema.String, { default: () => '' }),
  trigger_data: Schema.optionalWith(Schema.String, { default: () => '' }),
  state: Schema.optionalWith(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
    {
      default: () => null,
    }
  ),
  trigger_config: Schema.optionalWith(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
    {
      default: () => null,
    }
  ),
}).annotations({ identifier: 'TriggerInstanceItem' });
export type TriggerInstanceItem = Schema.Schema.Type<typeof TriggerInstanceItem>;

export const TriggerInstanceItems = Schema.Array(TriggerInstanceItem);
export type TriggerInstanceItems = Schema.Schema.Type<typeof TriggerInstanceItems>;
