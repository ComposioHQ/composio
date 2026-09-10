import { Effect, Schema } from 'effect';

/**
 * An auth config item from the list or retrieve endpoints.
 * Field names match the raw API response (snake_case).
 *
 * SECURITY: This schema intentionally excludes `credentials`, `shared_credentials`,
 * `proxy_config`, and `deprecated_params` fields to prevent secret leakage in CLI output.
 * Do NOT add credential-bearing fields without adding a redaction layer.
 */
export const AuthConfigItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  no_of_connections: Schema.Int,
  status: Schema.Literals(['ENABLED', 'DISABLED']),
  type: Schema.Literals(['default', 'custom']),
  uuid: Schema.String,
  toolkit: Schema.Struct({
    logo: Schema.String,
    slug: Schema.String,
  }),
  auth_scheme: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
  is_composio_managed: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  is_enabled_for_tool_router: Schema.Boolean.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(false))
  ),
  created_at: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
}).annotate({ identifier: 'AuthConfigItem' });
export type AuthConfigItem = Schema.Schema.Type<typeof AuthConfigItem>;

export const AuthConfigItems = Schema.Array(AuthConfigItem);
export type AuthConfigItems = Schema.Schema.Type<typeof AuthConfigItems>;
