/**
 * Type-level guard for the toolkit auth field mapping.
 *
 * `transformToolkitRetrieveResponse` projects each auth form field key by key.
 * A key the generated client declares but the projection forgets would be
 * silently stripped by zod while validating the transformed object.
 *
 * This file fails the build (tsconfig.type-tests.json) when `@composio/client`
 * declares a key in any of the four field groups, or on the auth config detail,
 * that is not covered below.
 *
 * This is only a coverage guard: it does not verify that the transformer still
 * assigns listed keys. The runtime test pins the projection for current keys;
 * this file covers generated-client keys nobody has seen yet.
 */
import type { ToolkitRetrieveResponse as RawToolkitRetrieveResponse } from '@composio/client/resources/toolkits';
import type { ToolkitAuthField, ToolkitAuthConfigDetails } from '../src';

type RawAuthConfigDetail = NonNullable<RawToolkitRetrieveResponse['auth_config_details']>[number];
type RawFields = RawAuthConfigDetail['fields'];

/**
 * The generated client declares each of the four field groups as its own
 * interface. They are identical today, but a plain `keyof` over their union
 * would yield only the keys they share, so a key added to one group alone would
 * slip through. Distributing `keyof` over the union keeps every group covered.
 */
type RawAuthField =
  | RawFields['auth_config_creation']['required'][number]
  | RawFields['auth_config_creation']['optional'][number]
  | RawFields['connected_account_initiation']['required'][number]
  | RawFields['connected_account_initiation']['optional'][number];

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/** Compile error carrying the offending keys when `Actual` is not empty. */
type NoneLeftOver<Actual extends PropertyKey> = [Actual] extends [never] ? true : Actual;

/**
 * Wire keys the transformer deliberately maps onto `ToolkitAuthField`.
 * Add a key here only together with the mapping and the schema field.
 */
type MappedFieldKeys =
  | 'name'
  | 'displayName'
  | 'description'
  | 'type'
  | 'required'
  | 'default'
  | 'is_secret'
  | 'user_visible'
  | 'legacy_template_name';

const everyFieldKeyIsMapped: NoneLeftOver<Exclude<KeysOfUnion<RawAuthField>, MappedFieldKeys>> =
  true;
void everyFieldKeyIsMapped;

/**
 * Wire keys on the auth config detail that are either mapped or deliberately
 * skipped. `deprecated_auth_provider_details` is covered because the client
 * marks it `@deprecated` and warns against further use.
 */
type CoveredDetailKeys =
  | 'name'
  | 'mode'
  | 'fields'
  | 'proxy'
  | 'auth_hint_url'
  | 'required_scopes'
  | 'deprecated_auth_provider_details';

const everyDetailKeyIsCovered: NoneLeftOver<
  Exclude<KeysOfUnion<RawAuthConfigDetail>, CoveredDetailKeys>
> = true;
void everyDetailKeyIsCovered;

/** The camelCase counterparts must exist on the public types. */
type MissingOnField = Exclude<
  | 'name'
  | 'displayName'
  | 'description'
  | 'type'
  | 'required'
  | 'default'
  | 'isSecret'
  | 'userVisible'
  | 'legacyTemplateName',
  keyof ToolkitAuthField
>;
const fieldTargetsExist: NoneLeftOver<MissingOnField> = true;
void fieldTargetsExist;

type MissingOnDetail = Exclude<
  'name' | 'mode' | 'fields' | 'proxy' | 'authHintUrl' | 'requiredScopes',
  keyof ToolkitAuthConfigDetails
>;
const detailTargetsExist: NoneLeftOver<MissingOnDetail> = true;
void detailTargetsExist;
