import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const Toolkit = Schema.Struct({
  name: Schema.String, // "Gmail"
  slug: Schema.Trim.pipe(Schema.nonEmptyString()), // "gmail"
  auth_schemes: Schema.Array(Schema.String), // [ "OAUTH2", "BEARER_TOKEN" ]
  composio_managed_auth_schemes: Schema.Array(Schema.String), // [ "OAUTH2" ]
  is_local_toolkit: Schema.Boolean,
  meta: Schema.Struct({
    description: Schema.String,
    categories: Schema.Array(Schema.Unknown),
    created_at: Schema.DateTimeUtc, // "2024-05-03T11:44:32.061Z"
    updated_at: Schema.DateTimeUtc, // "2024-05-03T11:44:32.061Z"
    available_versions: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
    tools_count: Schema.optionalWith(Schema.Int, { default: () => 0 }),
    triggers_count: Schema.optionalWith(Schema.Int, { default: () => 0 }),
  }),
  no_auth: Schema.Boolean,
}).annotations({ identifier: 'Toolkit' });
export type Toolkit = Schema.Schema.Type<typeof Toolkit>;

export const Toolkits = Schema.Array(Toolkit);
export type Toolkits = Schema.Schema.Type<typeof Toolkits>;

export const ToolkitsJSON = JSONTransformSchema(Toolkits);
export const toolkitsFromJSON = Schema.decode(ToolkitsJSON);
export const toolkitsToJSON = Schema.encode(ToolkitsJSON);

export type ToolkitName = string & Brand.Brand<'ToolkitName'>;
export const ToolkitName = Brand.nominal<ToolkitName>();

/**
 * Field definition for auth config creation / connected account initiation.
 */
export const AuthConfigField = Schema.Struct({
  name: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
  type: Schema.String,
  required: Schema.Boolean,
  default: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
}).annotations({ identifier: 'AuthConfigField' });
export type AuthConfigField = Schema.Schema.Type<typeof AuthConfigField>;

/**
 * Auth config detail for a specific auth scheme (e.g. OAUTH2, API_KEY).
 */
export const AuthConfigDetail = Schema.Struct({
  mode: Schema.String,
  name: Schema.String,
  fields: Schema.Struct({
    auth_config_creation: Schema.Struct({
      required: Schema.Array(AuthConfigField),
      optional: Schema.Array(AuthConfigField),
    }),
    connected_account_initiation: Schema.Struct({
      required: Schema.Array(AuthConfigField),
      optional: Schema.Array(AuthConfigField),
    }),
  }),
}).annotations({ identifier: 'AuthConfigDetail' });
export type AuthConfigDetail = Schema.Schema.Type<typeof AuthConfigDetail>;

/**
 * Detailed toolkit info from the retrieve endpoint, includes auth_config_details.
 */
export const ToolkitDetailed = Schema.Struct({
  name: Schema.String,
  slug: Schema.Trim.pipe(Schema.nonEmptyString()),
  is_local_toolkit: Schema.Boolean,
  composio_managed_auth_schemes: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
  no_auth: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  meta: Schema.Struct({
    description: Schema.optionalWith(Schema.String, { default: () => '' }),
    categories: Schema.optionalWith(Schema.Array(Schema.Unknown), { default: () => [] }),
    created_at: Schema.DateTimeUtc,
    updated_at: Schema.DateTimeUtc,
    available_versions: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
    tools_count: Schema.optionalWith(Schema.Int, { default: () => 0 }),
    triggers_count: Schema.optionalWith(Schema.Int, { default: () => 0 }),
  }),
  auth_config_details: Schema.optionalWith(Schema.Array(AuthConfigDetail), { default: () => [] }),
}).annotations({ identifier: 'ToolkitDetailed' });
export type ToolkitDetailed = Schema.Schema.Type<typeof ToolkitDetailed>;

/**
 * Search result for a single page of toolkits.
 */
export const ToolkitSearchResult = Schema.Struct({
  items: Toolkits,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotations({ identifier: 'ToolkitSearchResult' });
export type ToolkitSearchResult = Schema.Schema.Type<typeof ToolkitSearchResult>;
