import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';

export const TriggerType = Schema.String;
export type TriggerType = Schema.Schema.Type<typeof TriggerType>;

export const TriggerTypes = Schema.Array(TriggerType);
export type TriggerTypes = Schema.Schema.Type<typeof TriggerTypes>;

export const TriggerTypesJSON = JSONTransformSchema(TriggerTypes);
export const triggerTypesFromJSON = Schema.decode(TriggerTypesJSON);
export const triggerTypesToJSON = Schema.encode(TriggerTypesJSON);

// E.g., `NEW_EMAIL`
export type TriggerTypeName = string & Brand.Brand<'TriggerTypeName'>;
export const TriggerTypeName = Brand.nominal<TriggerTypeName>();

// E.g., `GMAIL_NEW_EMAIL`
export type TriggerTypeNameWithToolkitPrefix = string &
  Brand.Brand<'TriggerTypeNameWithToolkitPrefix'>;
export const TriggerTypeNameWithToolkitPrefix = Brand.nominal<TriggerTypeNameWithToolkitPrefix>();
