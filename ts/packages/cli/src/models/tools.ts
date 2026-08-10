import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';
import { extractActual } from './utils/extract-actual';

export const ToolAsEnum = Schema.String.annotations({ identifier: 'ToolAsEnum' });
export type ToolAsEnum = Schema.Schema.Type<typeof ToolAsEnum>;

export const ToolsAsEnums = Schema.Array(ToolAsEnum).annotations({
  identifier: 'Array<ToolAsEnum>',
  message: issue => ({
    message: `Expected an array of strings, got ${extractActual(issue)}`,
    override: true,
  }),
});
export type ToolsAsEnums = Schema.Schema.Type<typeof ToolsAsEnums>;

export const ToolsAsEnumsJSON = JSONTransformSchema(ToolsAsEnums);
export const toolsAsEnumsFromJSON = Schema.decode(ToolsAsEnumsJSON);
export const toolsAsEnumsToJSON = Schema.encode(ToolsAsEnumsJSON);

// E.g., `SEND_EMAIL`
export type ToolName = string & Brand.Brand<'ToolName'>;
export const ToolName = Brand.nominal<ToolName>();

// E.g., `GMAIL_SEND_EMAIL`
export type ToolNameWithToolkitPrefix = string & Brand.Brand<'ToolNameWithToolkitPrefix'>;
export const ToolNameWithToolkitPrefix = Brand.nominal<ToolNameWithToolkitPrefix>();

/**
 * Tool with payload
 */
export const Tool = Schema.Struct({
  /**
   * List of available versions of this tool
   */
  available_versions: Schema.Array(Schema.String),
  /**
   * Human-readable display name of the tool
   */
  name: Schema.String,
  /**
   * Unique identifier for the tool
   */
  slug: ToolAsEnum,
  /**
   * Schema definition of required input parameters for the tool
   */
  input_parameters: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  /**
   * Schema definition of required output parameters for the tool
   */
  output_parameters: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  /**
   * Detailed explanation of the tool's functionality and purpose.
   */
  description: Schema.String,
  /**
   * List of tags associated with the tool for categorization and filtering.
   */
  tags: Schema.Array(Schema.String),
}).annotations({ identifier: 'Tool' });
export type Tool = Schema.Schema.Type<typeof Tool>;

export const Tools = Schema.Array(Tool).annotations({ identifier: 'Array<Tool>' });
export type Tools = Schema.Schema.Type<typeof Tools>;

export const ToolsJSON = JSONTransformSchema(Tools);
export const ToolsFromJSON = Schema.decode(ToolsJSON);
export const ToolsToJSON = Schema.encode(ToolsJSON);
