import { Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';
import { OptionFromNullishOr } from 'effect/Schema';

export const UserData = Schema.Struct({
  /**
   * API key for the Composio API server.
   */
  apiKey: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('api_key')
  ),

  /**
   * Base URL for the Composio API server (backend).
   */
  baseURL: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('base_url')
  ),

  /**
   * Base URL for the Composio web app (frontend).
   */
  webURL: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('web_url')
  ),
}).annotations({
  identifier: 'UserData',
  description: 'User data storage for the Composio CLI',
});

export type UserData = Schema.Schema.Type<typeof UserData>;

export const UserDataWithDefaults = Schema.Struct({
  ...UserData.fields,

  baseURL: Schema.propertySignature(Schema.String).pipe(Schema.fromKey('base_url')),
  webURL: Schema.propertySignature(Schema.String).pipe(Schema.fromKey('web_url')),
}).annotations({
  identifier: 'UserDataWithDefaults',
  description: 'User data storage for the Composio CLI with defaults',
});

export type UserDataWithDefaults = Schema.Schema.Type<typeof UserDataWithDefaults>;

export const UserDataJSON = JSONTransformSchema(UserData);
export const userDataFromJSON = Schema.decode(UserDataJSON, {
  propertyOrder: 'original',
  onExcessProperty: 'preserve',
  exact: false,
});
export const userDataToJSON = Schema.encode(UserDataJSON);
