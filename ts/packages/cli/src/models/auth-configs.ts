import { Schema } from 'effect';

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
  status: Schema.Literal('ENABLED', 'DISABLED'),
  type: Schema.Literal('default', 'custom'),
  uuid: Schema.String,
  toolkit: Schema.Struct({
    logo: Schema.String,
    slug: Schema.String,
  }),
  auth_scheme: Schema.optionalWith(Schema.String, { default: () => '' }),
  is_composio_managed: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  is_enabled_for_tool_router: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  created_at: Schema.optionalWith(Schema.String, { default: () => '' }),
}).annotations({ identifier: 'AuthConfigItem' });
export type AuthConfigItem = Schema.Schema.Type<typeof AuthConfigItem>;

export const AuthConfigItems = Schema.Array(AuthConfigItem);
export type AuthConfigItems = Schema.Schema.Type<typeof AuthConfigItems>;
