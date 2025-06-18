import { BaseAgenticProvider, BaseComposioProvider } from '../provider/BaseProvider';
import { ToolExecuteParams, ToolExecuteResponse, Tool } from './tool.types';

/**
 * Modifier for altering the tool execute parameters before execution.
 *
 * This function allows you to intercept and modify the parameters being passed to a tool
 * before the actual execution happens. Common use cases include:
 * - Adding or modifying authentication parameters
 * - Transforming input data to match expected formats
 * - Adding contextual information to the request
 * - Implementing request validation or normalization
 *
 * @param {string} toolSlug - The slug identifier of the tool being executed
 * @param {string} toolkitSlug - The slug identifier of the toolkit containing the tool
 * @param {ToolExecuteParams} toolExecuteParams - The original execution parameters
 * @returns {ToolExecuteParams} The modified execution parameters
 *
 * @example
 * ```typescript
 * // Add authentication headers to all tool requests
 * const beforeExecute = (toolSlug, toolkitSlug, params) => {
 *   return {
 *     ...params,
 *     customAuthParams: {
 *       ...params.customAuthParams,
 *       headers: {
 *         ...params.customAuthParams?.headers,
 *         'X-API-Key': 'my-api-key'
 *       }
 *     }
 *   };
 * };
 *
 * // Transform input parameters for a specific tool
 * const beforeExecute = (toolSlug, toolkitSlug, params) => {
 *   if (toolSlug === 'GITHUB_SEARCH_REPOS') {
 *     // Convert simple query to structured query format
 *     return {
 *       ...params,
 *       arguments: {
 *         ...params.arguments,
 *         q: `${params.arguments.query} in:name,description`
 *       }
 *     };
 *   }
 *   return params;
 * };
 * ```
 */
export type beforeExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  toolExecuteParams: ToolExecuteParams
) => Promise<ToolExecuteParams> | ToolExecuteParams;

/**
 * Modifier for altering the tool execution response after execution completes.
 *
 * This function allows you to intercept and modify the response returned from a tool
 * after its execution has completed. Common use cases include:
 * - Transforming response data into a more convenient format
 * - Handling or enhancing error responses
 * - Adding additional context or derived data to successful responses
 * - Implementing cross-cutting concerns like logging or analytics
 *
 * @param {string} toolSlug - The slug identifier of the tool that was executed
 * @param {string} toolkitSlug - The slug identifier of the toolkit containing the tool
 * @param {ToolExecuteResponse} toolExecuteResponse - The original execution response
 * @returns {ToolExecuteResponse} The modified execution response
 *
 * @example
 * ```typescript
 * // Transform the response data format
 * const afterExecute = (toolSlug, toolkitSlug, response) => {
 *   if (toolSlug === 'GITHUB_LIST_REPOS' && response.successful) {
 *     // Transform the returned repos into a simpler format
 *     return {
 *       ...response,
 *       data: {
 *         repositories: response.data.items.map(repo => ({
 *           name: repo.name,
 *           url: repo.html_url,
 *           stars: repo.stargazers_count
 *         }))
 *       }
 *     };
 *   }
 *   return response;
 * };
 *
 * // Add error handling with custom messages
 * const afterExecute = (toolSlug, toolkitSlug, response) => {
 *   if (!response.successful) {
 *     return {
 *       ...response,
 *       error: {
 *         message: `Error using ${toolSlug}: ${response.error?.message || 'Unknown error'}`,
 *         code: response.error?.code || 'UNKNOWN_ERROR'
 *       }
 *     };
 *   }
 *   return response;
 * };
 * ```
 */
export type afterExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  toolExecuteResponse: ToolExecuteResponse
) => Promise<ToolExecuteResponse> | ToolExecuteResponse;

/**
 * Modifier for altering the tool schema before it's exposed to consumers.
 *
 * This function allows you to customize the metadata, parameters, and behavior definitions
 * of tools before they are used. Common use cases include:
 * - Customizing input parameter definitions or descriptions
 * - Adding, removing, or modifying parameters to match your application's needs
 * - Changing the name or description of tools to better fit your context
 * - Implementing versioning or feature flagging for tool schemas
 *
 * @param {string} toolSlug - The slug identifier of the tool being modified
 * @param {string} toolkitSlug - The slug identifier of the toolkit containing the tool
 * @param {Tool} toolSchema - The original tool schema
 * @returns {Tool} The modified tool schema
 *
 * @example
 * ```typescript
 * // Modify the input parameters for a specific tool
 * const modifySchema = (toolSlug, toolkitSlug, toolSchema) => {
 *   if (toolSlug === 'HACKERNEWS_GET_USER') {
 *     return {
 *       ...toolSchema,
 *       inputParameters: {
 *         ...toolSchema.inputParameters,
 *         userId: {
 *           type: 'string',
 *           description: 'The HackerNews username to retrieve information for',
 *           required: true
 *         }
 *       }
 *     };
 *   }
 *   return toolSchema;
 * };
 *
 * // Add custom descriptions to all tools in a toolkit
 * const modifySchema = (toolSlug, toolkitSlug, toolSchema) => {
 *   if (toolkitSlug === 'github') {
 *     return {
 *       ...toolSchema,
 *       description: `Company GitHub tool: ${toolSchema.description}`,
 *       important: true
 *     };
 *   }
 *   return toolSchema;
 * };
 *
 * // Simplify tool schemas for a specific consumer
 * const modifySchema = (toolSlug, toolkitSlug, toolSchema) => {
 *   // Remove advanced or complex parameters
 *   const { complexParam1, complexParam2, ...simpleInputParams } = toolSchema.inputParameters;
 *
 *   return {
 *     ...toolSchema,
 *     inputParameters: simpleInputParams
 *   };
 * };
 * ```
 */
export type TransformToolSchemaModifier = (
  toolSlug: string,
  toolkitSlug: string,
  toolSchema: Tool
) => Tool | Promise<Tool>;

/**
 * Options for non-agentic tool configuration.
 *
 * These options are used when working with non-agentic tool providers to
 * customize the behavior of tools through schema transformation.
 *
 * @example
 * ```typescript
 * // Configure tools with schema modification
 * const tools = await composio.tools.get('default', {
 *   toolkits: ['github']
 * }, {
 *   modifySchema: (toolSlug, toolkitSlug, schema) => {
 *     // Custom schema modifications
 *     return schema;
 *   }
 * });
 * ```
 */
export type ToolOptions = {
  /**
   * Function to transform tool schemas before they're exposed to consumers.
   * This allows customizing input/output parameters, descriptions, and other metadata.
   */
  modifySchema?: TransformToolSchemaModifier;
};

/**
 * Options for configuring tool execution behavior.
 *
 * These modifiers allow you to intercept and modify tool execution at both
 * the request and response stages, enabling custom behavior, data transformation,
 * error handling, and more.
 *
 * @example
 * ```typescript
 * // Execute a tool with request and response modifications
 * const result = await composio.tools.execute('GITHUB_GET_REPOS', {
 *   userId: 'default',
 *   arguments: { owner: 'composio' }
 * }, {
 *   beforeExecute: (toolSlug, toolkitSlug, params) => {
 *     console.log(`Executing ${toolSlug} from ${toolkitSlug}`);
 *     return params;
 *   },
 *   afterExecute: (toolSlug, toolkitSlug, response) => {
 *     if (response.successful) {
 *       console.log(`Successfully executed ${toolSlug}`);
 *     }
 *     return response;
 *   }
 * });
 * ```
 */
export type ExecuteToolModifiers = {
  /**
   * Function to intercept and modify tool execution parameters before the tool is executed.
   * This allows customizing the request based on tool-specific needs.
   */
  beforeExecute?: beforeExecuteModifier;

  /**
   * Function to intercept and modify tool execution responses after the tool has executed.
   * This allows transforming the response or implementing custom error handling.
   */
  afterExecute?: afterExecuteModifier;
};

/**
 * Options for agentic tool configuration.
 *
 * These options combine schema modification capabilities with execution behavior
 * customization, providing full control over both the definition and execution
 * of tools in agentic contexts (like LLM providers).
 *
 * @example
 * ```typescript
 * // Configure agentic tools with schema and execution modifications
 * const agenticTools = await vercel.tools.get('default', 'GITHUB_GET_REPOS', {
 *   modifySchema: (toolSlug, toolkitSlug, schema) => {
 *     return {
 *       ...schema,
 *       description: `Enhanced ${toolSlug} for better context`
 *     };
 *   },
 *
 *   // Intercept before execution
 *   beforeExecute: (toolSlug, toolkitSlug, params) => {
 *     // Add analytics tracking
 *     trackToolUsage(toolSlug);
 *     return params;
 *   },
 *
 *   // Transform after execution
 *   afterExecute: (toolSlug, toolkitSlug, response) => {
 *     // Log results and handle errors
 *     if (!response.successful) {
 *       logToolError(toolSlug, response.error);
 *     }
 *     return response;
 *   }
 * });
 * ```
 */
export type AgenticToolOptions = ToolOptions & ExecuteToolModifiers;

/**
 * Provider-specific options determined by the type of provider being used.
 *
 * This type automatically resolves to either AgenticToolOptions or ToolOptions
 * based on whether the provider is agentic (like OpenAI or Vercel) or non-agentic.
 *
 * @template T - The provider type
 *
 * @example
 * ```typescript
 * // With standard provider (non-agentic)
 * const tools = await composio.tools.get('default', 'GITHUB_GET_REPOS', {
 *   modifySchema: (toolSlug, toolkitSlug, schema) => schema
 * });
 *
 * // With agentic provider (e.g., VercelProvider)
 * const vercel = new Composio({
 *   apiKey: process.env.COMPOSIO_API_KEY,
 *   provider: new VercelProvider()
 * });
 *
 * const agenticTools = await vercel.tools.get('default', 'GITHUB_GET_REPOS', {
 *   modifySchema: (toolSlug, toolkitSlug, schema) => schema,
 *   beforeExecute: (toolSlug, toolkitSlug, params) => params,
 *   afterExecute: (toolSlug, toolkitSlug, response) => response
 * });
 * ```
 */
export type ProviderOptions<TProvider> =
  TProvider extends BaseComposioProvider<infer TToolCollection, infer TTool, infer TMcpResponse>
    ? TProvider extends BaseAgenticProvider<TToolCollection, TTool, TMcpResponse>
      ? AgenticToolOptions
      : ToolOptions
    : never;
