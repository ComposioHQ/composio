import { Brand, Schema } from 'effect';
import { JSONTransformSchema } from './utils/json-transform-schema';
import { extractActual } from './utils/extract-actual';

export const Tool = Schema.String.annotations({ identifier: 'Tool' });
export type Tool = Schema.Schema.Type<typeof Tool>;

export const Tools = Schema.Array(Tool).annotations({
  identifier: 'Array<Tool>',
  message: issue => ({
    message: `Expected an array of strings, got ${extractActual(issue)}`,
    override: true,
  }),
});
export type Tools = Schema.Schema.Type<typeof Tools>;

export const ToolsJSON = JSONTransformSchema(Tools);
export const toolsFromJSON = Schema.decode(ToolsJSON);
export const toolsToJSON = Schema.encode(ToolsJSON);

// E.g., `SEND_EMAIL`
export type ToolName = string & Brand.Brand<'ToolName'>;
export const ToolName = Brand.nominal<ToolName>();

// E.g., `GMAIL_SEND_EMAIL`
export type ToolNameWithToolkitPrefix = string & Brand.Brand<'ToolNameWithToolkitPrefix'>;
export const ToolNameWithToolkitPrefix = Brand.nominal<ToolNameWithToolkitPrefix>();
