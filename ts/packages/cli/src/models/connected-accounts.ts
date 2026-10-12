import { Effect, Option, Schema, SchemaGetter } from 'effect';

/**
 * Statuses this CLI build knows about. The server owns this enum and may add
 * values at any time, so schemas must stay open (see
 * {@link ConnectedAccountStatus}) — use {@link isKnownConnectedAccountStatus}
 * to detect values newer than this build.
 */
export const KnownConnectedAccountStatus = Schema.Literals([
  'INITIALIZING',
  'INITIATED',
  'ACTIVE',
  'FAILED',
  'EXPIRED',
  'INACTIVE',
  'REVOKED',
]);
export type KnownConnectedAccountStatus = typeof KnownConnectedAccountStatus.Type;

export const isKnownConnectedAccountStatus = Schema.is(KnownConnectedAccountStatus);

/**
 * Open enum for the server-owned account status: the known literals document
 * the values this build understands, the `Schema.String` branch lets a newer
 * status decode instead of failing the whole payload. Callers only compare
 * against literals or render the value as text, so widening is safe.
 */
export const ConnectedAccountStatus = Schema.Union([KnownConnectedAccountStatus, Schema.String]);

/**
 * Longest `display_name` the CLI prints, after trimming. A longer value is
 * left out rather than cut, because a cut identity could name a different
 * account.
 */
export const CONNECTED_ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 200;

/**
 * The only part of a connected account's `state` this CLI reads: the
 * provider identity Composio fills in at `state.val.displayName` once a
 * connection is active, such as the Gmail address or GitHub login. Decoding
 * keeps that one value and drops every other key of `state` and `val`.
 */
const ConnectedAccountProviderIdentity = Schema.Struct({
  val: Schema.Struct({
    displayName: Schema.Trim.check(
      Schema.isNonEmpty(),
      Schema.isMaxLength(CONNECTED_ACCOUNT_DISPLAY_NAME_MAX_LENGTH)
    ),
  }),
});

/**
 * The trimmed provider identity at `state.val.displayName`, or none. Raw
 * responses that skip `ConnectedAccountItem` use it too, so every path
 * applies the same rule.
 */
export const displayNameFromState = (state: unknown): Option.Option<string> =>
  Schema.decodeUnknownOption(ConnectedAccountProviderIdentity)(state).pipe(
    Option.map(identity => identity.val.displayName)
  );

/**
 * `display_name`, decoded from the raw `state` field (renamed by
 * `encodeKeys` below). It never fails the item: a missing, empty,
 * non-string, or too long `displayName` leaves the key out. Encoding drops
 * it, so `state` is never rebuilt from it.
 */
const DisplayNameFromState = Schema.optionalKey(Schema.Unknown).pipe(
  Schema.decodeTo(Schema.optionalKey(Schema.String), {
    decode: SchemaGetter.transformOptional(Option.flatMap(displayNameFromState)),
    encode: SchemaGetter.omit(),
  })
);

/**
 * A connected account item from the list or retrieve endpoints.
 * Field names match the raw API response (snake_case), except `display_name`,
 * which is read from `state`.
 *
 * SECURITY: This schema intentionally excludes `state`, `data`, `params`,
 * and `deprecated` fields to prevent credential leakage in CLI output.
 * The `state` discriminated union contains raw OAuth tokens, refresh tokens,
 * and API keys per auth scheme — never add it without a redaction layer.
 * `display_name` is the only value taken from `state`: the provider identity
 * at `state.val.displayName`, decoded by `ConnectedAccountProviderIdentity`,
 * which drops everything else.
 */
export const ConnectedAccountItem = Schema.Struct({
  id: Schema.String,
  word_id: Schema.optional(Schema.NullOr(Schema.String)),
  alias: Schema.optional(Schema.NullOr(Schema.String)),
  status: ConnectedAccountStatus,
  status_reason: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null))
  ),
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
  test_request_endpoint: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  display_name: DisplayNameFromState,
})
  .pipe(Schema.encodeKeys({ display_name: 'state' }))
  .annotate({ identifier: 'ConnectedAccountItem' });
export type ConnectedAccountItem = Schema.Schema.Type<typeof ConnectedAccountItem>;

export const ConnectedAccountItems = Schema.Array(ConnectedAccountItem);
export type ConnectedAccountItems = Schema.Schema.Type<typeof ConnectedAccountItems>;
