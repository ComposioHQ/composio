import { Effect, Schema } from 'effect';

/**
 * A trigger instance item from the list-active endpoint.
 * Field names match the raw API response (snake_case).
 */
export const TriggerInstanceItem = Schema.Struct({
  id: Schema.String,
  uuid: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  trigger_name: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  connected_account_id: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  auth_config_id: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  user_id: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  disabled_at: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null))
  ),
  updated_at: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  trigger_data: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  state: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null))
  ),
  trigger_config: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null))
  ),
}).annotate({ identifier: 'TriggerInstanceItem' });
export type TriggerInstanceItem = Schema.Schema.Type<typeof TriggerInstanceItem>;

export const TriggerInstanceItems = Schema.Array(TriggerInstanceItem);
export type TriggerInstanceItems = Schema.Schema.Type<typeof TriggerInstanceItems>;
