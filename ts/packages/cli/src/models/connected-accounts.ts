import { Schema } from 'effect';

/**
 * A connected account item from the list or retrieve endpoints.
 * Field names match the raw API response (snake_case).
 *
 * SECURITY: This schema intentionally excludes `state`, `data`, `params`,
 * and `deprecated` fields to prevent credential leakage in CLI output.
 * The `state` discriminated union contains raw OAuth tokens, refresh tokens,
 * and API keys per auth scheme — never add it without a redaction layer.
 */
export const ConnectedAccountItem = Schema.Struct({
  id: Schema.String,
  status: Schema.Literal('INITIALIZING', 'INITIATED', 'ACTIVE', 'FAILED', 'EXPIRED', 'INACTIVE'),
  status_reason: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
  is_disabled: Schema.Boolean,
  user_id: Schema.String,
  toolkit: Schema.Struct({
    slug: Schema.String,
  }),
  auth_config: Schema.Struct({
    id: Schema.String,
    auth_scheme: Schema.String,
    is_composio_managed: Schema.Boolean,
    is_disabled: Schema.Boolean,
  }),
  created_at: Schema.String,
  updated_at: Schema.String,
  test_request_endpoint: Schema.optionalWith(Schema.String, { default: () => '' }),
}).annotations({ identifier: 'ConnectedAccountItem' });
export type ConnectedAccountItem = Schema.Schema.Type<typeof ConnectedAccountItem>;

export const ConnectedAccountItems = Schema.Array(ConnectedAccountItem);
export type ConnectedAccountItems = Schema.Schema.Type<typeof ConnectedAccountItems>;
