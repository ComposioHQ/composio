import { z } from 'zod/v3';
import { CustomConnectionDataSchema } from './connectedAccountAuthStates.types';
import { TransformToolSchemaModifier } from './modifiers.types';

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
  tags: z.array(z.string()).describe('The tags of the tool. eg: Important').default([]).optional(),
  toolkit: ToolkitSchema.describe('The toolkit of the tool').optional(),
  version: z.string().describe('The version of the tool, e.g. "20250909_00"').optional(),
  isDeprecated: z.boolean().describe('Whether the tool is deprecated').optional(),
  availableVersions: z
    .array(z.string())
    .describe('Available versions of the tool.')
    .default([])
    .optional(),
  scopes: z.array(z.string()).describe('The scopes of the tool. eg: ["task:add"]').optional(),
  isNoAuth: z.boolean().describe('Do the tool support no auth?').optional(),
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

export const ToolkitLatestVersionSchema = z.literal('latest');
/**
 * latest toolkit version param
 */
export type ToolkitLatestVersion = z.infer<typeof ToolkitLatestVersionSchema>;

export const ToolkitVersionSchema = z.union([ToolkitLatestVersionSchema, z.string()]);
/**
 * Versioning a tool based on it's toolkit version, either 'latest' or actual tool version as string '20250902_00'
 * @example
 * 'latest'
 * '20250902_00'
 */
export type ToolkitVersion = z.infer<typeof ToolkitVersionSchema>;

export const ToolkitVersionsSchema = z.record(z.string(), ToolkitVersionSchema);
/**
 * Versioning multiple toolkits
 *  @example
 * { 'github': 'latest', 'slack': '20250902_00' }
 */
export type ToolkitVersions = Record<string, ToolkitVersion>;

export const ToolkitVersionParamSchema = z
  .union([ToolkitVersionsSchema, ToolkitLatestVersionSchema, z.undefined()])
  .describe('The versioning of the toolkits. eg: { "github": "latest", "slack": "20250902_00" }');
/**
 * Versioning a tool based on it's toolkit version
 * @example
 * ```json
 * { 'github': 'latest', 'slack': '20250902_00' }
 * ```
 */
export type ToolkitVersionParam = z.infer<typeof ToolkitVersionParamSchema>;

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
  search: string;
  tools?: never;
  toolkits?: never;
  scopes?: never;
  limit?: never;
  tags?: never;
};

// tools by auth config ids only
type AuthConfigIdsOnlyParams = {
  authConfigIds: string[];
  tools?: never;
  toolkits?: never;
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
 * Parameters for tool execution.
 *
 * @property {boolean} [allowTracing] - Enable tracing for this tool execution
 * @property {string} [connectedAccountId] - The connected account ID to use for authenticated tools
 * @property {CustomAuthParams} [customAuthParams] - Custom authentication parameters
 * @property {CustomConnectionData} [customConnectionData] - Custom connection data (takes priority over customAuthParams)
 * @property {Record<string, unknown>} [arguments] - The arguments to pass to the tool
 * @property {string} [userId] - The user ID to execute the tool for (required for no-auth apps)
 * @property {string} [version] - The specific version of the tool to execute (e.g., "20250909_00" or "latest")
 * @property {boolean} [dangerouslySkipVersionCheck] - Skip version validation when using "latest" version.
 *   **Warning:** This may cause unexpected behavior when new toolkit versions are released.
 *   Only use this if you understand the risks. Recommended alternatives:
 *   - Specify a concrete version in the `version` parameter
 *   - Configure toolkit versions at SDK initialization level
 *   - Set toolkit version via environment variable (COMPOSIO_TOOLKIT_VERSION_<TOOLKIT_SLUG>)
 * @property {string} [text] - Additional text input for the tool
 *
 * @example Recommended: Execute with a specific version
 * ```typescript
 * const params: ToolExecuteParams = {
 *   userId: 'default',
 *   version: '20250909_00',
 *   arguments: { owner: 'composio', repo: 'sdk' }
 * };
 * ```
 *
 * @example With dangerouslySkipVersionCheck (use with caution)
 * ```typescript
 * const params: ToolExecuteParams = {
 *   userId: 'default',
 *   dangerouslySkipVersionCheck: true,
 *   arguments: { userId: 'pg' }
 * };
 * ```
 */
export const ToolExecuteParamsSchema = z.object({
  allowTracing: z.boolean().optional(),
  connectedAccountId: z.string().optional(),
  customAuthParams: CustomAuthParamsSchema.optional(),
  customConnectionData: CustomConnectionDataSchema.optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().optional(),
  version: z.union([z.literal('latest'), z.string()]).optional(),
  dangerouslySkipVersionCheck: z.boolean().optional(),
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
  /**
   * @deprecated
   */
  customConnectionData: CustomConnectionDataSchema.describe(
    'DEPRECATED: This field is deprecated and will be removed in the future.'
  ).optional(),
});
export type ToolProxyParams = z.infer<typeof ToolProxyParamsSchema>;

export type SchemaModifierOptions = {
  modifySchema: TransformToolSchemaModifier;
};
