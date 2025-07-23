import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';
import { extractActual } from './utils/extract-actual';

export const TriggerType = Schema.String.annotations({ identifier: 'TriggerType' });
export type TriggerType = Schema.Schema.Type<typeof TriggerType>;

export const TriggerTypes = Schema.Array(TriggerType).annotations({
  identifier: 'Array<TriggerType>',
  title: 'TriggerTypes',
  message: issue => ({
    message: `Expected an array of strings, got ${extractActual(issue)}`,
    override: true,
  }),
});
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
