import { z } from 'zod';

/**
 * Toolkit is the collection of tools,
 * A toolkit can be thought of as an app which provides a set of tools/actions/triggers.
 *
 * eg. Google Toolkit, which provides tools like Google Search, Google Maps, Google Translate, etc.
 */
export const ToolkitSchema = z.object({
  slug: z.string().describe('The slug of the toolkit'),
  name: z.string().describe('The name of the toolkit'),
  logo: z.string().describe('The logo of the toolkit').optional(),
});
export type Toolkit = z.infer<typeof ToolkitSchema>;

// JSON Schema primitive types
const JSONSchemaType = z.enum([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
]);

// JSON Schema property definition
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const JSONSchemaPropertySchema: z.ZodType<any> = z.object({
  type: z.union([JSONSchemaType, z.array(JSONSchemaType)]).optional(),
  description: z.string().optional(),
  anyOf: z.lazy(() => z.array(JSONSchemaPropertySchema)).optional(),
  oneOf: z.lazy(() => z.array(JSONSchemaPropertySchema)).optional(),
  allOf: z.lazy(() => z.array(JSONSchemaPropertySchema)).optional(),
  not: z.lazy(() => JSONSchemaPropertySchema).optional(),
  title: z.string().optional(),
  default: z.any().optional(),
  nullable: z.boolean().optional(),
  properties: z.lazy(() => z.record(z.string(), JSONSchemaPropertySchema)).optional(),
  required: z.array(z.string()).optional(),
  file_uploadable: z.boolean().optional(),
  file_downloadable: z.boolean().optional(),
  items: z
    .lazy(() => z.union([JSONSchemaPropertySchema, z.array(JSONSchemaPropertySchema)]))
    .optional(),
  enum: z.array(z.any()).optional(),
  const: z.any().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  exclusiveMinimum: z.number().optional(),
  exclusiveMaximum: z.number().optional(),
  multipleOf: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  format: z.string().optional(),
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
  uniqueItems: z.boolean().optional(),
  minProperties: z.number().optional(),
  maxProperties: z.number().optional(),
  patternProperties: z.lazy(() => z.record(z.string(), JSONSchemaPropertySchema)).optional(),
  additionalProperties: z.union([z.boolean(), z.lazy(() => JSONSchemaPropertySchema)]).optional(),
  examples: z.array(z.any()).optional(),
  readOnly: z.boolean().optional(),
  writeOnly: z.boolean().optional(),
  if: z.lazy(() => JSONSchemaPropertySchema).optional(),
  then: z.lazy(() => JSONSchemaPropertySchema).optional(),
  else: z.lazy(() => JSONSchemaPropertySchema).optional(),
  $ref: z.string().optional(),
  definitions: z
    .record(
      z.string(),
      z.lazy(() => JSONSchemaPropertySchema)
    )
    .optional(),
  $defs: z
    .record(
      z.string(),
      z.lazy(() => JSONSchemaPropertySchema)
    )
    .optional(),
});
export type JSONSchemaProperty = z.infer<typeof JSONSchemaPropertySchema>;

// Schema for parameters (input/output)
const ParametersSchema = z.object({
  type: z.literal('object'),
  anyOf: z.array(JSONSchemaPropertySchema).optional(),
  oneOf: z.array(JSONSchemaPropertySchema).optional(),
  allOf: z.array(JSONSchemaPropertySchema).optional(),
  not: JSONSchemaPropertySchema.optional(),
  properties: z.record(z.string(), JSONSchemaPropertySchema),
  required: z.array(z.string()).optional(),
  title: z.string().optional(),
  default: z.any().optional(),
  nullable: z.boolean().optional(),
  description: z.string().optional(),
  additionalProperties: z.boolean().default(false).optional(),
});

/**
 * Tool is a single action that can be performed by a toolkit.
 * Tool is simlar to an action that an app can perform.
 *
 * eg. Google Search, Google Maps, Google Translate, etc.
 */
export const ToolSchema = z.object({
  slug: z.string().describe('The slug of the tool. eg. "GOOGLE_SEARCH"'),
  name: z.string().describe(`The name of the tool. eg. "Google Search"`),
  description: z.string().optional().describe('The description of the tool'),
  inputParameters: ParametersSchema.optional().describe('The input parameters of the tool'),
  outputParameters: ParametersSchema.optional().describe('The output parameters of the tool'),
  tags: z.optional(z.array(z.string())).describe('The tags of the tool. eg: Important').default([]),
  toolkit: z.optional(ToolkitSchema).describe('The toolkit of the tool'),
  version: z.optional(z.string()).describe('The version of the tool, e.g. "1.0.0"'),
  scopes: z.optional(z.array(z.string())).describe('The scopes of the tool. eg: ["task:add"]'),
});
export type Tool = z.infer<typeof ToolSchema>;

/**
 * ToolListResponse Schema
 */
export const ToolListResponseSchema = z.object({
  items: z.array(ToolSchema),
  nextCursor: z.string().nullable().optional(),
  totalPages: z.number(),
});
export type ToolListResponse = z.infer<typeof ToolListResponseSchema>;

/**
 * Plain SDK level Tool List
 */
export type ToolList = Array<Tool>;

export const ToolListParamsSchema = z.object({
  tools: z.array(z.string()).optional(),
  toolkits: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  search: z.string().optional(),
  authConfigIds: z.array(z.string()).optional(),
});

type BaseParams = {
  limit?: number;
  search?: string;
  scopes?: string[];
  tags?: string[];
};

// tools only
type ToolsOnlyParams = {
  tools: string[];
  toolkits?: never;
  scopes?: never;
  search?: never;
  tags?: never;
};

// toolkits only
type ToolkitsOnlyParams = {
  toolkits: string[];
  tools?: never;
  scopes?: never;
} & Pick<BaseParams, 'limit' | 'search' | 'tags'>;

// toolkit + scopes (single toolkit only)
type ToolkitScopeOnlyParams = {
  toolkits: [string];
  tools?: never;
  scopes: string[];
} & Pick<BaseParams, 'limit' | 'search' | 'tags'>;

// tags only
type TagsOnlyParams = {
  toolkits?: string[];
  tags: string[];
  tools?: never;
  search?: never;
} & Pick<BaseParams, 'limit'>;

// search only
type SearchOnlyParams = {
  tools?: never;
  toolkits?: never;
  scopes?: never;
  limit?: never;
  search: string;
  tags?: never;
};

// tools by auth config ids only
type AuthConfigIdsOnlyParams = {
  authConfigIds: string[];
  tools?: never;
  toolkit?: never;
} & Pick<BaseParams, 'limit' | 'search' | 'tags'>;
/**
 * ToolListParams is the parameters for the list of tools.
 * You must provide either tools or toolkits, but not both.
 */
export type ToolListParams =
  | ToolsOnlyParams
  | ToolkitsOnlyParams
  | ToolkitScopeOnlyParams
  | SearchOnlyParams
  | TagsOnlyParams
  | AuthConfigIdsOnlyParams;

/**
 * CustomAuthParams is the parameters for the custom authentication.
 */
export const CustomAuthParamsSchema = z.object({
  baseURL: z.string().optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  parameters: z.array(
    z.object({
      in: z.enum(['query', 'header']),
      name: z.string(),
      value: z.union([z.string(), z.number()]),
    })
  ),
});
export type CustomAuthParams = z.infer<typeof CustomAuthParamsSchema>;

/**
 * ToolExecuteParams is the parameters for the tool execution.
 */
export const ToolExecuteParamsSchema = z.object({
  allowTracing: z.boolean().optional(),
  connectedAccountId: z.string().optional(),
  customAuthParams: CustomAuthParamsSchema.optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  userId: z.string(),
  version: z.string().optional(),
  text: z.string().optional(),
});
export type ToolExecuteParams = z.infer<typeof ToolExecuteParamsSchema>;

/**
 * ToolResponse Schema
 */
export const ToolExecuteResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  error: z.string().nullable(),
  successful: z.boolean(),
  logId: z.string().optional(),
  sessionInfo: z.unknown().optional(),
});
export type ToolExecuteResponse = z.infer<typeof ToolExecuteResponseSchema>;

export const ToolProxyParamsSchema = z.object({
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  body: z.unknown().optional(),
  parameters: z
    .array(
      z.object({
        in: z.enum(['query', 'header']),
        name: z.string(),
        value: z.union([z.string(), z.number()]),
      })
    )
    .optional(),
  connectedAccountId: z.string().optional(),
});
export type ToolProxyParams = z.infer<typeof ToolProxyParamsSchema>;
