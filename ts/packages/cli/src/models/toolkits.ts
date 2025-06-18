import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const Toolkit = Schema.Struct({
  name: Schema.String, // "Gmail"
  slug: Schema.String, // "gmail"
  auth_schemes: Schema.Array(Schema.String), // [ "OAUTH2", "BEARER_TOKEN" ]
  composio_managed_auth_schemes: Schema.Array(Schema.String), // [ "OAUTH2" ]
  is_local_toolkit: Schema.Boolean,
  meta: Schema.Struct({
    description: Schema.String,
    categories: Schema.Array(Schema.Unknown),
    created_at: Schema.DateTimeUtc, // "2024-05-03T11:44:32.061Z"
    updated_at: Schema.DateTimeUtc, // "2024-05-03T11:44:32.061Z"
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
