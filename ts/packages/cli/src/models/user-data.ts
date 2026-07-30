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

  /**
   * Organization ID for the current user.
   */
  orgId: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('org_id')
  ),

  /**
   * Legacy global project ID retained for backward-compatible reads.
   * New CLI versions no longer persist this field.
   */
  projectId: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('project_id')
  ),

  /**
   * Optional global test user identifier used by CLI/e2e flows.
   */
  testUserId: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('test_user_id')
  ),

  /**
   * Marks `api_key` above as the plaintext fallback the CLI must keep
   * treating as authoritative because the OS credential store could
   * not durably hold it. Carries no secret itself.
   */
  apiKeyFallback: Schema.optionalWith(Schema.Boolean, { default: () => false }).pipe(
    Schema.fromKey('api_key_fallback')
  ),

  /**
   * Set by logout when deleting the keyring credential could not be
   * confirmed. While set, the CLI reports logged out regardless of
   * what the credential store holds, and retries the deletion on every
   * start. Carries no secret itself.
   */
  pendingKeyringLogout: Schema.optionalWith(Schema.Boolean, { default: () => false }).pipe(
    Schema.fromKey('pending_keyring_logout')
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

  // orgId and legacy projectId remain as Option<string> — they may not be set.
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
