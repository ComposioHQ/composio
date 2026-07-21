import { Brand, Effect, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';

/**
 * A toolkit slug used to derive generated source filenames.
 *
 * Restricted to a single, safe path segment (no `/`, `\`, or `..`) to prevent
 * path traversal / arbitrary file write when the slug is interpolated into a
 * filename and joined to the generator's output directory. See CWE-22.
 */
export const ToolkitSlug = Schema.Trim.check(
  Schema.isNonEmpty(),
  Schema.isPattern(/^[a-z0-9_][a-z0-9_-]*$/, {
    identifier: 'ToolkitSlug',
    message:
      'Toolkit slug must contain only lowercase letters, digits, underscores, and hyphens (no path separators)',
  })
);

export const Toolkit = Schema.Struct({
  name: Schema.String, // "Gmail"
  slug: ToolkitSlug, // "gmail"
  auth_schemes: Schema.Array(Schema.String), // [ "OAUTH2", "BEARER_TOKEN" ]
  composio_managed_auth_schemes: Schema.Array(Schema.String), // [ "OAUTH2" ]
  is_local_toolkit: Schema.Boolean,
  meta: Schema.Struct({
    description: Schema.String,
    categories: Schema.Array(Schema.Unknown),
    created_at: Schema.DateTimeUtcFromString, // "2024-05-03T11:44:32.061Z"
    updated_at: Schema.DateTimeUtcFromString, // "2024-05-03T11:44:32.061Z"
    available_versions: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefaultType(Effect.succeed([]))
    ),
    tools_count: Schema.Int.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
    triggers_count: Schema.Int.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
  }),
  no_auth: Schema.Boolean,
}).annotate({ identifier: 'Toolkit' });
export type Toolkit = Schema.Schema.Type<typeof Toolkit>;

export const Toolkits = Schema.Array(Toolkit);
export type Toolkits = Schema.Schema.Type<typeof Toolkits>;

export const ToolkitsJSON = JSONTransformSchema(Toolkits);
export const toolkitsFromJSON = Schema.decodeEffect(ToolkitsJSON);
export const toolkitsToJSON = Schema.encodeEffect(ToolkitsJSON);

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
  default: Schema.NullOr(Schema.String).pipe(Schema.withDecodingDefaultType(Effect.succeed(null))),
}).annotate({ identifier: 'AuthConfigField' });
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
}).annotate({ identifier: 'AuthConfigDetail' });
export type AuthConfigDetail = Schema.Schema.Type<typeof AuthConfigDetail>;

/**
 * Detailed toolkit info from the retrieve endpoint, includes auth_config_details.
 */
export const ToolkitDetailed = Schema.Struct({
  name: Schema.String,
  slug: ToolkitSlug,
  is_local_toolkit: Schema.Boolean,
  composio_managed_auth_schemes: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([]))
  ),
  no_auth: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  meta: Schema.Struct({
    description: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(''))),
    categories: Schema.Array(Schema.Unknown).pipe(
      Schema.withDecodingDefaultType(Effect.succeed([]))
    ),
    created_at: Schema.DateTimeUtcFromString,
    updated_at: Schema.DateTimeUtcFromString,
    available_versions: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefaultType(Effect.succeed([]))
    ),
    tools_count: Schema.Int.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
    triggers_count: Schema.Int.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
  }),
  auth_config_details: Schema.Array(AuthConfigDetail).pipe(
    Schema.withDecodingDefaultType(Effect.succeed([]))
  ),
}).annotate({ identifier: 'ToolkitDetailed' });
export type ToolkitDetailed = Schema.Schema.Type<typeof ToolkitDetailed>;

/**
 * Search result for a single page of toolkits.
 */
export const ToolkitSearchResult = Schema.Struct({
  items: Toolkits,
  total_items: Schema.Int,
  total_pages: Schema.Int,
  next_cursor: Schema.NullOr(Schema.String),
}).annotate({ identifier: 'ToolkitSearchResult' });
export type ToolkitSearchResult = Schema.Schema.Type<typeof ToolkitSearchResult>;
