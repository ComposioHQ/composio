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
 * // Example 1: Add authentication headers to all tool requests
 * const beforeExecute = ({ params, toolSlug, toolkitSlug }) => {
 *   // Log the execution attempt
 *   console.log(`Executing ${toolSlug} from toolkit ${toolkitSlug}`);
 *
 *   // Add authentication and tracking headers
 *   return {
 *     ...params,
 *     customAuthParams: {
 *       ...params.customAuthParams,
 *       headers: {
 *         ...params.customAuthParams?.headers,
 *         'X-API-Key': 'my-api-key',
 *         'X-Request-ID': generateRequestId(),
 *         'X-Toolkit': toolkitSlug
 *       }
 *     }
 *   };
 * };
 *
 * // Example 2: Transform input parameters for specific tools with validation
 * const beforeExecute = ({ params, toolSlug, toolkitSlug }) => {
 *   // Handle different tools
 *   switch (toolSlug) {
 *     case 'GITHUB_SEARCH_REPOS':
 *       // Enhance search query with additional filters
 *       return {
 *         ...params,
 *         arguments: {
 *           ...params.arguments,
 *           q: `${params.arguments.query} in:name,description language:typescript stars:>100`,
 *           sort: 'stars',
 *           order: 'desc'
 *         }
 *       };
 *
 *     case 'NPM_PACKAGE_INFO':
 *       // Validate and normalize package name
 *       const pkgName = params.arguments.packageName.trim().toLowerCase();
 *       if (!pkgName) {
 *         throw new Error('Package name is required');
 *       }
 *
 *       return {
 *         ...params,
 *         arguments: {
 *           ...params.arguments,
 *           packageName: pkgName,
 *           includeVersions: true
 *         }
 *       };
 *
 *     default:
 *       return params;
 *   }
 * };
 * ```
 */
export type beforeExecuteModifier = (context: {
  toolSlug: string;
  toolkitSlug: string;
  params: ToolExecuteParams;
}) => Promise<ToolExecuteParams> | ToolExecuteParams;

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
 * // Example 1: Transform and enrich response data
 * const afterExecute = ({ result, toolSlug, toolkitSlug }) => {
 *   // Handle successful GitHub repository listing
 *   if (toolSlug === 'GITHUB_LIST_REPOS' && result.successful) {
 *     // Transform the returned repos into a more useful format
 *     const repositories = result.data.items.map(repo => ({
 *       name: repo.name,
 *       url: repo.html_url,
 *       stars: repo.stargazers_count,
 *       // Add derived and computed fields
 *       isPopular: repo.stargazers_count > 1000,
 *       lastUpdated: new Date(repo.updated_at).toLocaleDateString(),
 *       topics: repo.topics || [],
 *       license: repo.license?.spdx_id || 'No License'
 *     }));
 *
 *     // Add metadata about the response
 *     return {
 *       ...result,
 *       data: {
 *         repositories,
 *         totalCount: result.data.total_count,
 *         metadata: {
 *           queryTime: new Date().toISOString(),
 *           toolkit: toolkitSlug,
 *           filterApplied: true
 *         }
 *       }
 *     };
 *   }
 *
 *   return result;
 * };
 *
 * // Example 2: Comprehensive error handling and logging
 * const afterExecute = ({ result, toolSlug, toolkitSlug }) => {
 *   // Log all executions for monitoring
 *   logToolExecution(toolSlug, toolkitSlug, result.successful);
 *
 *   if (!result.successful) {
 *     // Get error details
 *     const errorCode = result.error?.code || 'UNKNOWN_ERROR';
 *     const errorMessage = result.error?.message || 'An unknown error occurred';
 *
 *     // Handle specific error cases
 *     switch (errorCode) {
 *       case 'RATE_LIMIT_EXCEEDED':
 *         notifyRateLimitExceeded(toolkitSlug);
 *         break;
 *       case 'AUTHENTICATION_FAILED':
 *         refreshAuthToken(toolkitSlug);
 *         break;
 *     }
 *
 *     // Return enhanced error response
 *     return {
 *       ...result,
 *       error: {
 *         message: `Error using ${toolSlug}: ${errorMessage}`,
 *         code: errorCode,
 *         timestamp: new Date().toISOString(),
 *         context: {
 *           toolkit: toolkitSlug,
 *           severity: getSeverityLevel(errorCode),
 *           retryable: isRetryableError(errorCode)
 *         }
 *       }
 *     };
 *   }
 *
 *   return result;
 * };
 * ```
 */
export type afterExecuteModifier = (context: {
  toolSlug: string;
  toolkitSlug: string;
  result: ToolExecuteResponse;
}) => Promise<ToolExecuteResponse> | ToolExecuteResponse;

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
 * // Example 1: Comprehensive schema modification with validation
 * const modifySchema = ({ schema, toolSlug, toolkitSlug }) => {
 *   // Handle specific tools
 *   if (toolSlug === 'HACKERNEWS_GET_USER') {
 *     return {
 *       ...schema,
 *       name: 'Get HackerNews User Profile',
 *       description: 'Retrieve detailed user information from HackerNews',
 *       version: '2.0.0',
 *       inputParameters: {
 *         ...schema.inputParameters,
 *         userId: {
 *           type: 'string',
 *           description: 'The HackerNews username to retrieve information for',
 *           required: true,
 *           minLength: 2,
 *           maxLength: 15,
 *           pattern: '^[a-zA-Z0-9_-]+$'
 *         },
 *         includeSubmissions: {
 *           type: 'boolean',
 *           description: 'Include user submissions in the response',
 *           default: false
 *         },
 *         submissionLimit: {
 *           type: 'number',
 *           description: 'Maximum number of submissions to return',
 *           default: 10,
 *           minimum: 1,
 *           maximum: 100
 *         }
 *       },
 *       outputSchema: {
 *         type: 'object',
 *         properties: {
 *           user: {
 *             type: 'object',
 *             properties: {
 *               id: { type: 'string' },
 *               karma: { type: 'number' },
 *               created: { type: 'string', format: 'date-time' },
 *               submissions: { type: 'array', items: { type: 'object' } }
 *             }
 *           }
 *         }
 *       }
 *     };
 *   }
 *
 *   return schema;
 * };
 *
 * // Example 2: Add organization-specific customizations
 * const modifySchema = ({ schema, toolSlug, toolkitSlug }) => {
 *   // Add organization prefix to all GitHub tools
 *   if (toolkitSlug === 'github') {
 *     const enhancedSchema = {
 *       ...schema,
 *       name: `Acme Corp - ${schema.name}`,
 *       description: `Company GitHub tool: ${schema.description}`,
 *       category: 'Internal Tools',
 *       tags: [...(schema.tags || []), 'acme-corp', 'internal'],
 *       metadata: {
 *         ...(schema.metadata || {}),
 *         organization: 'acme-corp',
 *         department: 'engineering',
 *         supportContact: 'tools@acme-corp.com'
 *       },
 *       authentication: {
 *         type: 'oauth2',
 *         scopes: ['repo', 'user'],
 *         enterpriseServer: 'github.acme-corp.com'
 *       }
 *     };
 *
 *     // Add rate limiting metadata
 *     if (schema.rateLimit) {
 *       enhancedSchema.rateLimit = {
 *         ...schema.rateLimit,
 *         enterprise: {
 *           requests: 5000,
 *           per: '1 hour'
 *         }
 *       };
 *     }
 *
 *     return enhancedSchema;
 *   }
 *
 *   return schema;
 * };
 *
 * // Example 3: Simplify schemas for external consumers
 * const modifySchema = ({ schema }) => {
 *   // Remove internal or complex parameters
 *   const {
 *     debugMode,
 *     internalFlags,
 *     experimentalFeatures,
 *     ...simpleInputParams
 *   } = schema.inputParameters;
 *
 *   // Simplify authentication requirements
 *   const { oauth2, apiKey, ...simpleAuth } = schema.authentication || {};
 *
 *   return {
 *     ...schema,
 *     inputParameters: simpleInputParams,
 *     authentication: {
 *       type: 'apiKey',
 *       in: 'header',
 *       name: 'X-API-Key'
 *     },
 *     // Remove internal metadata
 *     metadata: {
 *       isPublic: true,
 *       version: schema.metadata?.version
 *     }
 *   };
 * };
 * ```
 */
export type TransformToolSchemaModifier = (context: {
  toolSlug: string;
  toolkitSlug: string;
  schema: Tool;
}) => Tool | Promise<Tool>;

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
 *   modifySchema: (context) => {
 *     // Custom schema modifications
 *     return context.schema;
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
 *   beforeExecute: (context) => {
 *     console.log(`Executing ${context.toolSlug} from ${context.toolkitSlug}`);
 *     return context.params;
 *   },
 *   afterExecute: (context) => {
 *     if (context.result.successful) {
 *       console.log(`Successfully executed ${context.toolSlug}`);
 *     }
 *     return context.result;
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
 * Modifier for altering the meta tool execute parameters before execution in a session context.
 *
 * This function is specifically designed for meta tools executed within a tool router session,
 * allowing you to intercept and modify the parameters before execution. Meta tools are
 * grouped under the 'composio' toolkit slug for organizational purposes.
 *
 * @param {string} toolSlug - The slug identifier of the meta tool being executed
 * @param {string} toolkitSlug - The toolkit slug (always 'composio' for meta tools)
 * @param {string} sessionId - The session ID for the tool router context
 * @param {Record<string, unknown>} params - The parameters being passed to the meta tool
 * @returns {Record<string, unknown>} The modified parameters
 *
 * @example
 * ```typescript
 * const beforeExecuteMeta = ({ toolSlug, toolkitSlug, sessionId, params }) => {
 *   console.log(`Executing ${toolkitSlug} meta tool ${toolSlug} in session ${sessionId}`);
 *
 *   // Add or modify parameters
 *   return {
 *     ...params,
 *     timestamp: new Date().toISOString()
 *   };
 * };
 * ```
 */
export type beforeExecuteMetaModifier = (context: {
  toolSlug: string;
  toolkitSlug: string;
  sessionId: string;
  params: Record<string, unknown>;
}) => Promise<Record<string, unknown>> | Record<string, unknown>;

/**
 * Modifier for altering the meta tool execution response after execution completes in a session context.
 *
 * This function is specifically designed for meta tools executed within a tool router session,
 * allowing you to intercept and modify the response after execution. This is useful for
 * session-specific transformations, logging, or error handling.
 *
 * @param {string} toolSlug - The slug identifier of the meta tool that was executed
 * @param {string} toolkitSlug - The toolkit slug (always 'composio' for meta tools)
 * @param {string} sessionId - The session ID for the tool router context
 * @param {ToolExecuteResponse} result - The original execution response
 * @returns {ToolExecuteResponse} The modified execution response
 *
 * @example
 * ```typescript
 * const afterExecuteMeta = ({ toolSlug, toolkitSlug, sessionId, result }) => {
 *   // Log session-specific execution
 *   console.log(`${toolkitSlug} meta tool ${toolSlug} completed in session ${sessionId}`);
 *
 *   if (!result.successful) {
 *     console.error(`Session ${sessionId} error:`, result.error);
 *   }
 *
 *   return result;
 * };
 * ```
 */
export type afterExecuteMetaModifier = (context: {
  toolSlug: string;
  toolkitSlug: string;
  sessionId: string;
  result: ToolExecuteResponse;
}) => Promise<ToolExecuteResponse> | ToolExecuteResponse;

/**
 * Modifiers specifically for meta tool execution within a session context.
 *
 * These modifiers are designed for tool router session-based meta tool execution,
 * providing hooks to intercept and modify both the request and response of meta tools.
 * Meta tools are grouped under the 'composio' toolkit for organizational consistency.
 *
 * @example
 * ```typescript
 * const metaModifiers: SessionExecuteMetaModifiers = {
 *   beforeExecute: ({ toolSlug, toolkitSlug, sessionId, params }) => {
 *     // Add session tracking
 *     console.log(`Executing ${toolkitSlug}/${toolSlug}`);
 *     return {
 *       ...params,
 *       sessionMetadata: {
 *         startTime: Date.now(),
 *         sessionId
 *       }
 *     };
 *   },
 *
 *   afterExecute: ({ toolSlug, toolkitSlug, sessionId, result }) => {
 *     // Transform session results
 *     return {
 *       ...result,
 *       sessionInfo: {
 *         sessionId,
 *         toolSlug,
 *         toolkitSlug,
 *         completedAt: new Date().toISOString()
 *       }
 *     };
 *   }
 * };
 * ```
 */
export type SessionExecuteMetaModifiers = {
  /**
   * Function to intercept and modify meta tool execution parameters before the tool is executed.
   * This allows customizing the request based on session-specific needs.
   */
  beforeExecute?: beforeExecuteMetaModifier;

  /**
   * Function to intercept and modify meta tool execution responses after the tool has executed.
   * This allows transforming the response or implementing custom session-specific handling.
   */
  afterExecute?: afterExecuteMetaModifier;
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
 *   modifySchema: (context) => {
 *     return {
 *       ...context.schema,
 *       description: `Enhanced ${context.toolSlug} for better context`
 *     };
 *   },
 *
 *   // Intercept before execution
 *   beforeExecute: (context) => {
 *     // Add analytics tracking
 *     trackToolUsage(context.toolSlug);
 *     return context.params;
 *   },
 *
 *   // Transform after execution
 *   afterExecute: (context) => {
 *     // Log results and handle errors
 *     if (!context.result.successful) {
 *       logToolError(context.toolSlug, context.result.error);
 *     }
 *     return context.result;
 *   }
 * });
 * ```
 */
export type AgenticToolOptions = ToolOptions & ExecuteToolModifiers;

/**
 * Options for session-based meta tool configuration in tool router contexts.
 *
 * These options combine schema modification capabilities with session-specific execution
 * behavior customization, providing control over both the definition and execution
 * of meta tools within a tool router session. Meta tools are grouped under the 'composio' toolkit.
 *
 * @example
 * ```typescript
 * // Configure meta tools with schema and session-specific execution modifications
 * const sessionTools = await toolRouter.getTools(sessionId, {
 *   modifySchema: (context) => {
 *     return {
 *       ...context.schema,
 *       description: `Session-specific ${context.toolSlug}`
 *     };
 *   },
 *
 *   // Intercept before meta tool execution
 *   beforeExecute: ({ toolSlug, toolkitSlug, sessionId, params }) => {
 *     // Add session tracking
 *     console.log(`Executing ${toolkitSlug}/${toolSlug}`);
 *     return {
 *       ...params,
 *       sessionMetadata: { sessionId, timestamp: Date.now() }
 *     };
 *   },
 *
 *   // Transform after meta tool execution
 *   afterExecute: ({ toolSlug, toolkitSlug, sessionId, result }) => {
 *     // Log session results
 *     if (!result.successful) {
 *       logSessionError(sessionId, toolkitSlug, toolSlug, result.error);
 *     }
 *     return result;
 *   }
 * });
 * ```
 */
export type SessionMetaToolOptions = ToolOptions & SessionExecuteMetaModifiers;

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
 *   modifySchema: (context) => context.schema
 * });
 *
 * // With agentic provider (e.g., VercelProvider)
 * const vercel = new Composio({
 *   apiKey: process.env.COMPOSIO_API_KEY,
 *   provider: new VercelProvider()
 * });
 *
 * const agenticTools = await vercel.tools.get('default', 'GITHUB_GET_REPOS', {
 *   modifySchema: (context) => context.schema,
 *   beforeExecute: (context) => context.params,
 *   afterExecute: (context) => context.result
 * });
 * ```
 */
export type ProviderOptions<TProvider> =
  TProvider extends BaseComposioProvider<infer TToolCollection, infer TTool, infer TMcpResponse>
    ? TProvider extends BaseAgenticProvider<TToolCollection, TTool, TMcpResponse>
      ? AgenticToolOptions
      : ToolOptions
    : never;
