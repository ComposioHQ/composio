import { Schema } from 'effect';

/**
 * Statuses this CLI build knows about. The server owns this enum and may add
 * values at any time, so schemas must stay open (see
 * {@link ConnectedAccountStatus}) — use {@link isKnownConnectedAccountStatus}
 * to detect values newer than this build.
 */
export const KnownConnectedAccountStatus = Schema.Literal(
  'INITIALIZING',
  'INITIATED',
  'ACTIVE',
  'FAILED',
  'EXPIRED',
  'INACTIVE',
  'REVOKED'
);
export type KnownConnectedAccountStatus = typeof KnownConnectedAccountStatus.Type;

export const isKnownConnectedAccountStatus = Schema.is(KnownConnectedAccountStatus);

/**
 * Open enum for the server-owned account status: the known literals document
 * the values this build understands, the `Schema.String` branch lets a newer
 * status decode instead of failing the whole payload. Callers only compare
 * against literals or render the value as text, so widening is safe.
 */
export const ConnectedAccountStatus = Schema.Union(KnownConnectedAccountStatus, Schema.String);

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
  word_id: Schema.optional(Schema.NullOr(Schema.String)),
  alias: Schema.optional(Schema.NullOr(Schema.String)),
  status: ConnectedAccountStatus,
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
