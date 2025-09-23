import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';
import { extractActual } from './utils/extract-actual';

/**
 * TriggerType as Enums
 */

export const TriggerTypeAsEnum = Schema.String.annotations({ identifier: 'TriggerType' });
export type TriggerTypeAsEnum = Schema.Schema.Type<typeof TriggerTypeAsEnum>;

export const TriggerTypesAsEnums = Schema.Array(TriggerTypeAsEnum).annotations({
  identifier: 'Array<TriggerTypeAsEnum>',
  title: 'TriggerTypesAsEnums',
  message: issue => ({
    message: `Expected an array of strings, got ${extractActual(issue)}`,
    override: true,
  }),
});
export type TriggerTypesAsEnums = Schema.Schema.Type<typeof TriggerTypesAsEnums>;

export const TriggerTypesAsEnumsJSON = JSONTransformSchema(TriggerTypesAsEnums);
export const TriggerTypesAsEnumsFromJSON = Schema.decode(TriggerTypesAsEnumsJSON);
export const TriggerTypesAsEnumsToJSON = Schema.encode(TriggerTypesAsEnumsJSON);

/**
 * TriggerType with payload
 */

export const TriggerType = Schema.Struct({
  /**
   * Configuration schema required to set up this trigger
   */
  config: Schema.Record({ key: Schema.String, value: Schema.Unknown }),

  /**
   * Detailed description of what the trigger does
   */
  description: Schema.String,

  /**
   * Step-by-step instructions on how to set up and use this trigger
   */
  instructions: Schema.String,

  /**
   * Human-readable name of the trigger
   */
  name: TriggerTypeAsEnum,

  /**
   * Schema of the data payload this trigger will deliver when it fires
   */
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),

  /**
   * Unique identifier for the trigger type
   */
  slug: Schema.String,

  /**
   * Information about the toolkit that provides this trigger
   */
  // toolkit: Toolkit,

  /**
   * The trigger mechanism - either webhook (event-based) or poll (scheduled check)
   */
  type: Schema.Literal('webhook', 'poll'),
}).annotations({ identifier: 'TriggerType' });
export type TriggerType = Schema.Schema.Type<typeof TriggerType>;

export const TriggerTypeJSON = JSONTransformSchema(TriggerType);
export const TriggerTypeFromJSON = Schema.decode(TriggerTypeJSON);
export const TriggerTypeToJSON = Schema.encode(TriggerTypeJSON);

export const TriggerTypes = Schema.Array(TriggerType).annotations({
  identifier: 'Array<TriggerType>',
  title: 'TriggerTypes',
});
export type TriggerTypes = Schema.Schema.Type<typeof TriggerTypes>;

export const TriggerTypesJSON = JSONTransformSchema(TriggerTypes);
export const TriggerTypesFromJSON = Schema.decode(TriggerTypesJSON);
export const TriggerTypesToJSON = Schema.encode(TriggerTypesJSON);

// E.g., `NEW_EMAIL`
export type TriggerTypeName = string & Brand.Brand<'TriggerTypeName'>;
export const TriggerTypeName = Brand.nominal<TriggerTypeName>();

// E.g., `GMAIL_NEW_EMAIL`
export type TriggerTypeNameWithToolkitPrefix = string &
  Brand.Brand<'TriggerTypeNameWithToolkitPrefix'>;
export const TriggerTypeNameWithToolkitPrefix = Brand.nominal<TriggerTypeNameWithToolkitPrefix>();
