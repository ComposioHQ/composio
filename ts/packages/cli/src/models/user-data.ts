import { Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';
import { OptionFromOptionalNullOr } from 'effect/Schema';

// `OptionFromOptionalNullOr` (rather than `OptionFromNullishOr`) tolerates a
// missing key in addition to an explicit `null`/`undefined` value: real
// `user_data.json` files written by older CLI versions may predate a field
// (e.g. `test_user_id`) and simply omit the key. Requiring the key to be
// present would fail decoding and — via the load fallback in
// `services/user-context.ts` — silently reset the whole file to defaults,
// discarding an otherwise-valid `org_id` / `api_key`.
const userDataFields = {
  /**
   * API key for the Composio API server.
   */
  apiKey: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * Base URL for the Composio API server (backend).
   */
  baseURL: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * Base URL for the Composio web app (frontend).
   */
  webURL: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * Organization ID for the current user.
   */
  orgId: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * Legacy global project ID retained for backward-compatible reads.
   * New CLI versions no longer persist this field.
   */
  projectId: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * Optional global test user identifier used by CLI/e2e flows.
   */
  testUserId: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),
};

const userDataKeyMapping = {
  apiKey: 'api_key',
  baseURL: 'base_url',
  webURL: 'web_url',
  orgId: 'org_id',
  projectId: 'project_id',
  testUserId: 'test_user_id',
} as const;

export const UserData = Schema.Struct(userDataFields).pipe(
  Schema.encodeKeys(userDataKeyMapping),
  Schema.annotate({
    identifier: 'UserData',
    description: 'User data storage for the Composio CLI',
  })
);

export type UserData = Schema.Schema.Type<typeof UserData>;

export const UserDataWithDefaults = Schema.Struct({
  ...userDataFields,

  baseURL: Schema.String,
  webURL: Schema.String,

  // orgId and legacy projectId remain as Option<string> — they may not be set.
}).pipe(
  Schema.encodeKeys(userDataKeyMapping),
  Schema.annotate({
    identifier: 'UserDataWithDefaults',
    description: 'User data storage for the Composio CLI with defaults',
  })
);

export type UserDataWithDefaults = Schema.Schema.Type<typeof UserDataWithDefaults>;

export const UserDataJSON = JSONTransformSchema(UserData);
export const userDataFromJSON = Schema.decodeEffect(UserDataJSON, {
  propertyOrder: 'original',
  onExcessProperty: 'preserve',
});
export const userDataToJSON = Schema.encodeEffect(UserDataJSON);
