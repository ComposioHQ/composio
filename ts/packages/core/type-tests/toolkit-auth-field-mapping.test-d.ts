/**
 * Type-level guard for the toolkit auth field mapping.
 *
 * `transformToolkitRetrieveResponse` projects each auth form field key by key.
 * A key the generated client declares but the projection forgets is dropped
 * silently: zod removes it while validating, and no runtime test notices unless
 * someone thought to assert that exact key. That is how `is_secret`,
 * `legacy_template_name` and `auth_hint_url` were lost.
 *
 * What this file does: it fails the build (tsconfig.type-tests.json) when
 * `@composio/client` declares a key in any of the four field groups, or on the
 * auth config detail, that is not listed below.
 *
 * What it does NOT do: it does not verify that the transformer still assigns
 * those keys. The lists here are hand-written, so removing an assignment from
 * the mapper while leaving its key listed stays green at compile time. The
 * runtime test pins the projection for the keys known today
 * (`test/utils/transformers/toolkits.test.ts`, "maps a whole field without
 * losing or inventing keys"); this file covers the keys nobody has seen yet.
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
  | 'legacy_template_name';

const everyFieldKeyIsMapped: NoneLeftOver<Exclude<KeysOfUnion<RawAuthField>, MappedFieldKeys>> =
  true;
void everyFieldKeyIsMapped;

/**
 * Wire keys on the auth config detail. `deprecated_auth_provider_details` is
 * listed as knowingly skipped: the client marks it `@deprecated` and warns
 * against further use, so it is excluded on purpose rather than by oversight.
 */
type MappedDetailKeys =
  'name' | 'mode' | 'fields' | 'proxy' | 'auth_hint_url' | 'deprecated_auth_provider_details';

const everyDetailKeyIsMapped: NoneLeftOver<
  Exclude<KeysOfUnion<RawAuthConfigDetail>, MappedDetailKeys>
> = true;
void everyDetailKeyIsMapped;

/** The camelCase counterparts must exist on the public types. */
type MissingOnField = Exclude<
  | 'name'
  | 'displayName'
  | 'description'
  | 'type'
  | 'required'
  | 'default'
  | 'isSecret'
  | 'legacyTemplateName',
  keyof ToolkitAuthField
>;
const fieldTargetsExist: NoneLeftOver<MissingOnField> = true;
void fieldTargetsExist;

type MissingOnDetail = Exclude<
  'name' | 'mode' | 'fields' | 'proxy' | 'authHintUrl',
  keyof ToolkitAuthConfigDetails
>;
const detailTargetsExist: NoneLeftOver<MissingOnDetail> = true;
void detailTargetsExist;
