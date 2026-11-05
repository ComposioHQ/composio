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

/** Longest provider display name the CLI will print, once trimmed. */
export const CONNECTED_ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 200;

/**
 * The single value this CLI reads out of a connected account's `state`: the
 * provider identity Composio records at `state.val.displayName` for an active
 * connection (a Gmail address, a GitHub login, ...). Decoding against this
 * narrow shape keeps that value and discards every other key under `state`.
 */
const ProviderIdentityFromState = Schema.Struct({
  val: Schema.Struct({
    displayName: Schema.Trim.check(
      Schema.isNonEmpty(),
      Schema.isMaxLength(CONNECTED_ACCOUNT_DISPLAY_NAME_MAX_LENGTH)
    ),
  }),
});

/**
 * The trimmed display name held in a raw `state` value, or `None` when it is
 * absent, blank, not a string, or longer than the limit.
 */
const displayNameFromState = (state: unknown): Option.Option<string> =>
  Schema.decodeUnknownOption(ProviderIdentityFromState)(state).pipe(
    Option.map(identity => identity.val.displayName)
  );

/**
 * `display_name` as decoded from the raw `state` key (see `encodeKeys` on
 * {@link ConnectedAccountItem}). Decoding never fails the item: any unusable
 * display name simply leaves the field out. Encoding omits it, so a decoded
 * item can never be turned back into a `state` payload.
 */
const DisplayNameFromState = Schema.optionalKey(Schema.Unknown).pipe(
  Schema.decodeTo(Schema.optionalKey(Schema.String), {
    decode: SchemaGetter.transformOptional(Option.flatMap(displayNameFromState)),
    encode: SchemaGetter.omit(),
  })
);

/**
 * A connected account item from the list or retrieve endpoints.
 * Field names match the raw API response (snake_case).
 *
 * SECURITY: This schema intentionally excludes `state`, `data`, `params`,
 * and `deprecated` fields to prevent credential leakage in CLI output.
 * The `state` discriminated union contains raw OAuth tokens, refresh tokens,
 * and API keys per auth scheme — never add it without a redaction layer.
 * `display_name` is the one exception: it is extracted from `state` through
 * {@link ProviderIdentityFromState}, which retains nothing else.
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

// Connected account list response (single page with total_items for "Listing X of Y" display)
export const ConnectedAccountListResponse = Schema.Struct({
  items: ConnectedAccountItems,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  current_page: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null))
  ),
}).annotate({ identifier: 'ConnectedAccountListResponse' });
export type ConnectedAccountListResponse = Schema.Schema.Type<typeof ConnectedAccountListResponse>;
