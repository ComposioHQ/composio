import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';

/**
 * TriggerType as Enums
 */

export const TriggerTypeAsEnum = Schema.String.annotate({ identifier: 'TriggerType' });
export type TriggerTypeAsEnum = Schema.Schema.Type<typeof TriggerTypeAsEnum>;

export const TriggerTypesAsEnums = Schema.Array(TriggerTypeAsEnum).annotate({
  identifier: 'Array<TriggerTypeAsEnum>',
  title: 'TriggerTypesAsEnums',
  message: 'Expected an array of strings',
});
export type TriggerTypesAsEnums = Schema.Schema.Type<typeof TriggerTypesAsEnums>;

export const TriggerTypesAsEnumsJSON = JSONTransformSchema(TriggerTypesAsEnums);
export const TriggerTypesAsEnumsFromJSON = Schema.decodeEffect(TriggerTypesAsEnumsJSON);
export const TriggerTypesAsEnumsToJSON = Schema.encodeEffect(TriggerTypesAsEnumsJSON);

/**
 * TriggerType with payload
 */

export const TriggerType = Schema.Struct({
  /**
   * Configuration schema required to set up this trigger
   */
  config: Schema.Record(Schema.String, Schema.Unknown),

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
  payload: Schema.Record(Schema.String, Schema.Unknown),

  /**
   * Unique identifier for the trigger type
   */
  slug: Schema.String,

  /**
   * Information about the toolkit that provides this trigger
   */
  toolkit: Schema.optional(
    Schema.Struct({
      name: Schema.String,
      slug: Schema.String,
    })
  ),

  /**
   * The trigger mechanism - either webhook (event-based) or poll (scheduled check)
   */
  type: Schema.Literals(['webhook', 'poll']),
}).annotate({ identifier: 'TriggerType' });
export type TriggerType = Schema.Schema.Type<typeof TriggerType>;

export const TriggerTypeJSON = JSONTransformSchema(TriggerType);
export const TriggerTypeFromJSON = Schema.decodeEffect(TriggerTypeJSON);
export const TriggerTypeToJSON = Schema.encodeEffect(TriggerTypeJSON);

export const TriggerTypes = Schema.Array(TriggerType).annotate({
  identifier: 'Array<TriggerType>',
  title: 'TriggerTypes',
});
export type TriggerTypes = Schema.Schema.Type<typeof TriggerTypes>;

export const TriggerTypesJSON = JSONTransformSchema(TriggerTypes);
export const TriggerTypesFromJSON = Schema.decodeEffect(TriggerTypesJSON);
export const TriggerTypesToJSON = Schema.encodeEffect(TriggerTypesJSON);

// E.g., `NEW_EMAIL`
export type TriggerTypeName = string & Brand.Brand<'TriggerTypeName'>;
export const TriggerTypeName = Brand.nominal<TriggerTypeName>();

// E.g., `GMAIL_NEW_EMAIL`
export type TriggerTypeNameWithToolkitPrefix = string &
  Brand.Brand<'TriggerTypeNameWithToolkitPrefix'>;
export const TriggerTypeNameWithToolkitPrefix = Brand.nominal<TriggerTypeNameWithToolkitPrefix>();
