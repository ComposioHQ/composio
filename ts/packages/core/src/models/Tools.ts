import ComposioClient from '@composio/client';
import {
  Tool,
  ToolExecuteParams,
  ToolListParamsSchema,
  ToolExecuteResponse,
  ToolList,
  ToolSchema,
  ToolListParams,
  ToolExecuteResponseSchema,
  ToolProxyParamsSchema,
  ToolProxyParams,
  ToolExecuteParamsSchema,
  ToolkitVersionParam,
  SchemaModifierOptions,
  ToolExecuteMetaParamsSchema,
} from '../types/tool.types';
import {
  ToolGetInputParams,
  ToolGetInputResponse,
  ToolProxyParams as ComposioToolProxyParams,
  ToolProxyResponse,
  ToolRetrieveEnumResponse,
  ToolRetrieveResponse,
  ToolListResponse as ComposioToolListResponse,
  ToolExecuteResponse as ComposioToolExecuteResponse,
  ToolListParams as ComposioToolListParams,
} from '@composio/client/resources/tools';
import { CustomTools } from './CustomTools';
import { CustomToolInputParameter, CustomToolOptions } from '../types/customTool.types';
import {
  afterExecuteModifier,
  beforeExecuteModifier,
  ExecuteToolModifiers,
  SessionExecuteMetaModifiers,
  ProviderOptions,
  TransformToolSchemaModifier,
} from '../types/modifiers.types';
import { BaseComposioProvider } from '../provider/BaseProvider';
import logger from '../utils/logger';
import { ExecuteToolFn, GlobalExecuteToolFn } from '../types/provider.types';
import {
  ComposioCustomToolsNotInitializedError,
  ComposioInvalidModifierError,
  ComposioToolNotFoundError,
  ComposioProviderNotDefinedError,
  ComposioToolVersionRequiredError,
} from '../errors/ToolErrors';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { FileToolModifier } from '../utils/modifiers/FileToolModifier';
import { ComposioConfig } from '../composio';
import { getToolkitVersion } from '../utils/toolkitVersion';
import { handleToolExecutionError } from '../errors/ToolErrors';
import { ToolExecuteMetaParams } from '../types/tool.types';
import { SessionExecuteMetaParams } from '@composio/client/resources/tool-router.mjs';
/**
 * This class is used to manage tools in the Composio SDK.
 * It provides methods to list, get, and execute tools.
 */
export class Tools<
  TToolCollection,
  TTool,
  TProvider extends BaseComposioProvider<TToolCollection, TTool, unknown>,
> {
  private client: ComposioClient;
  private readonly customTools: CustomTools;
  private provider: TProvider;
  private autoUploadDownloadFiles: boolean;
  private toolkitVersions: ToolkitVersionParam;

  constructor(client: ComposioClient, config?: ComposioConfig<TProvider>) {
    if (!client) {
      throw new Error('ComposioClient is required');
    }
    if (!config?.provider) {
      throw new ComposioProviderNotDefinedError('Provider not passed into Tools instance');
    }

    this.client = client;
    this.customTools = new CustomTools(client);
    this.provider = config.provider;
    this.autoUploadDownloadFiles = config?.autoUploadDownloadFiles ?? true;
    this.toolkitVersions = config?.toolkitVersions ?? 'latest';
    // Bind the execute method to ensure correct 'this' context
    this.execute = this.execute.bind(this);
    // Set the execute method for the provider.
    this.provider._setExecuteToolFn(this.createExecuteFnForProviders());
    // Bind methods that use customTools to ensure correct 'this' context
    this.getRawComposioToolBySlug = this.getRawComposioToolBySlug.bind(this);
    this.getRawComposioTools = this.getRawComposioTools.bind(this);

    telemetry.instrument(this, 'Tools');
  }

  /**
   * Transforms tool data from snake_case API format to camelCase for internal SDK use.
   *
   * This method standardizes the property naming convention for tools retrieved from the Composio API,
   * making them more consistent with JavaScript/TypeScript conventions.
   *
   * @param {ToolRetrieveResponse | ComposioToolListResponse['items'][0]} tool - The tool object to transform
   * @returns {Tool} The transformed tool with camelCase properties
   *
   * @private
   */
  private transformToolCases(
    tool: ToolRetrieveResponse | ComposioToolListResponse['items'][0]
  ): Tool {
    return ToolSchema.parse({
      ...tool,
      inputParameters: tool.input_parameters,
      outputParameters: tool.output_parameters,
      availableVersions: tool.available_versions,
      isDeprecated: tool.deprecated?.is_deprecated ?? false,
      isNoAuth: tool.no_auth,
    });
  }

  /**
   * Transforms tool execution response from snake_case API format to camelCase.
   *
   * This method converts the response received from the Composio API to a standardized format
   * with consistent property naming that follows JavaScript/TypeScript conventions.
   *
   * @param {ComposioToolExecuteResponse} response - The raw API response to transform
   * @returns {ToolExecuteResponse} The transformed response with camelCase properties
   *
   * @private
   */
  private transformToolExecuteResponse(response: ComposioToolExecuteResponse): ToolExecuteResponse {
    return ToolExecuteResponseSchema.parse({
      data: response.data,
      error: response.error,
      successful: response.successful,
      logId: response.log_id,
      sessionInfo: response.session_info,
    });
  }

  /**
   * Applies the default schema modifiers to the tools
   * @param tools - The tools to apply the default schema modifiers to
   * @returns The tools with the default schema modifiers applied
   */
  private async applyDefaultSchemaModifiers(tools: Tool[]): Promise<Tool[]> {
    if (this.autoUploadDownloadFiles) {
      const fileToolModifier = new FileToolModifier(this.client);
      return await Promise.all(
        tools.map(tool =>
          fileToolModifier.modifyToolSchema(tool.slug, tool.toolkit?.slug ?? 'unknown', tool)
        )
      );
    } else {
      return tools;
    }
  }

  /**
   * Applies the before execute modifiers to the tool execution params
   * @param options.toolSlug - The slug of the tool
   * @param options.toolkitSlug - The slug of the toolkit
   * @param options.params - The params of the tool execution
   * @param modifier - The modifier to apply
   * @returns The modified params
   */
  private async applyBeforeExecuteModifiers(
    tool: Tool,
    {
      toolSlug,
      toolkitSlug,
      params,
    }: {
      toolSlug: string;
      toolkitSlug: string;
      params: ToolExecuteParams;
    },
    modifier?: beforeExecuteModifier
  ): Promise<ToolExecuteParams> {
    let modifiedParams = params;
    // if auto upload download files is enabled, upload the files to the Composio API
    if (this.autoUploadDownloadFiles) {
      const fileToolModifier = new FileToolModifier(this.client);
      modifiedParams = await fileToolModifier.fileUploadModifier(tool, {
        toolSlug,
        toolkitSlug,
        params: modifiedParams,
      });
    }
    // apply the before execute modifiers
    if (modifier) {
      if (typeof modifier === 'function') {
        modifiedParams = await modifier({
          toolSlug,
          toolkitSlug,
          params: modifiedParams,
        });
      } else {
        throw new ComposioInvalidModifierError('Invalid beforeExecute modifier. Not a function.');
      }
    }
    return modifiedParams;
  }

  /**
   * Applies the after execute modifiers to the tool execution result
   * @param options.toolSlug - The slug of the tool
   * @param options.toolkitSlug - The slug of the toolkit
   * @param options.result - The result of the tool execution
   * @param modifier - The modifier to apply
   * @returns The modified result
   */
  private async applyAfterExecuteModifiers(
    tool: Tool,
    {
      toolSlug,
      toolkitSlug,
      result,
    }: {
      toolSlug: string;
      toolkitSlug: string;
      result: ToolExecuteResponse;
    },
    modifier?: afterExecuteModifier
  ): Promise<ToolExecuteResponse> {
    let modifiedResult = result;
    // if auto upload download files is enabled, download the files from the Composio API
    if (this.autoUploadDownloadFiles) {
      const fileToolModifier = new FileToolModifier(this.client);
      modifiedResult = await fileToolModifier.fileDownloadModifier(tool, {
        toolSlug,
        toolkitSlug,
        result: modifiedResult,
      });
    }
    // apply the after execute modifiers
    if (modifier) {
      if (typeof modifier === 'function') {
        modifiedResult = await modifier({
          toolSlug,
          toolkitSlug,
          result: modifiedResult,
        });
      } else {
        throw new ComposioInvalidModifierError('Invalid afterExecute modifier. Not a function.');
      }
    }

    return modifiedResult;
  }

  /**
   * Lists all tools available in the Composio SDK including custom tools.
   *
   * This method fetches tools from the Composio API in raw format and combines them with
   * any registered custom tools. The response can be filtered and modified as needed.
   * It provides access to the underlying tool data without provider-specific wrapping.
   *
   * @param {ToolListParams} query - Query parameters to filter the tools (required)
   * @param {GetRawComposioToolsOptions} [options] - Optional configuration for tool retrieval
   * @param {TransformToolSchemaModifier} [options.modifySchema] - Function to transform tool schemas
   * @returns {Promise<ToolList>} List of tools matching the query criteria
   *
   * @example
   * ```typescript
   * // Get tools from specific toolkits
   * const githubTools = await composio.tools.getRawComposioTools({
   *   toolkits: ['github'],
   *   limit: 10
   * });
   *
   * // Get specific tools by slug
   * const specificTools = await composio.tools.getRawComposioTools({
   *   tools: ['GITHUB_GET_REPOS', 'HACKERNEWS_GET_USER']
   * });
   *
   * // Get tools from specific toolkits
   * const githubTools = await composio.tools.getRawComposioTools({
   *   toolkits: ['github'],
   *   limit: 10
   * });
   *
   * // Get tools with schema transformation
   * const customizedTools = await composio.tools.getRawComposioTools({
   *   toolkits: ['github'],
   *   limit: 5
   * }, {
   *   modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
   *     // Add custom properties to tool schema
   *     return {
   *       ...schema,
   *       customProperty: `Modified ${toolSlug} from ${toolkitSlug}`,
   *       tags: [...(schema.tags || []), 'customized']
   *     };
   *   }
   * });
   *
   * // Search for tools
   * const searchResults = await composio.tools.getRawComposioTools({
   *   search: 'user management'
   * });
   *
   * // Get tools by authentication config
   * const authSpecificTools = await composio.tools.getRawComposioTools({
   *   authConfigIds: ['auth_config_123']
   * });
   * ```
   */
  async getRawComposioTools(
    query: ToolListParams,
    options?: SchemaModifierOptions
  ): Promise<ToolList> {
    if ('tools' in query && 'toolkits' in query) {
      throw new ValidationError(
        'Invalid tool list parameters. You should not use tools and toolkits filter together.'
      );
    }

    const queryParams = ToolListParamsSchema.safeParse(query);
    if (queryParams.error) {
      throw new ValidationError('Invalid tool list parameters', {
        cause: queryParams.error,
      });
    }

    // check if the query params contains atleast one of the following: tools, toolkits, search, authConfigIds
    if (
      !(
        'tools' in queryParams.data ||
        'toolkits' in queryParams.data ||
        'search' in queryParams.data ||
        'authConfigIds' in queryParams.data
      )
    ) {
      throw new ValidationError(
        'Invalid tool list parameters, atleast one of the following parameters is required: tools, toolkits, search, authConfigIds'
      );
    }

    // if tools are provided, set the limit to 9999 so that all tools are fetched
    let limit = 'limit' in queryParams.data ? queryParams.data.limit : undefined;
    if ('tools' in queryParams.data) {
      limit = 9999;
    }

    const filters: ComposioToolListParams = {
      ...('tools' in queryParams.data ? { tool_slugs: queryParams.data.tools?.join(',') } : {}),
      ...('toolkits' in queryParams.data
        ? { toolkit_slug: queryParams.data.toolkits?.join(',') }
        : {}),
      ...(limit ? { limit } : {}),
      ...('tags' in queryParams.data ? { tags: queryParams.data.tags } : {}),
      ...('scopes' in queryParams.data ? { scopes: queryParams.data.scopes } : {}),
      ...('search' in queryParams.data ? { search: queryParams.data.search } : {}),
      ...('authConfigIds' in queryParams.data
        ? { auth_config_ids: queryParams.data.authConfigIds }
        : {}),
      ...{ toolkit_versions: this.toolkitVersions },
    };

    logger.debug(`Fetching tools with filters: ${JSON.stringify(filters, null, 2)}`);

    const tools = await this.client.tools.list(filters);

    if (!tools) {
      return [];
    }
    const caseTransformedTools = tools.items.map(tool => this.transformToolCases(tool));

    const customTools = await this.customTools.getCustomTools({
      toolSlugs: 'tools' in queryParams.data ? queryParams.data.tools : undefined,
    });

    let modifiedTools = await this.applyDefaultSchemaModifiers([
      ...caseTransformedTools,
      ...customTools,
    ]);

    // apply local modifiers if they are provided
    if (options?.modifySchema) {
      const modifier = options.modifySchema;
      if (typeof modifier === 'function') {
        const modifiedPromises = modifiedTools.map(tool =>
          modifier({
            toolSlug: tool.slug,
            toolkitSlug: tool.toolkit?.slug ?? 'unknown',
            schema: tool,
          })
        );
        modifiedTools = await Promise.all(modifiedPromises);
      } else {
        throw new ComposioInvalidModifierError('Invalid schema modifier. Not a function.');
      }
    }

    return modifiedTools;
  }

  /**
   * Fetches the meta tools for a tool router session.
   * This method fetches the meta tools from the Composio API and transforms them to the expected format.
   * It provides access to the underlying meta tool data without provider-specific wrapping.
   *
   * @param sessionId {string} The session id to get the meta tools for
   * @param options {SchemaModifierOptions} Optional configuration for tool retrieval
   * @param {TransformToolSchemaModifier} [options.modifySchema] - Function to transform the tool schema
   * @returns {Promise<ToolList>} The list of meta tools
   *
   * @example
   * ```typescript
   * const metaTools = await composio.tools.getRawToolRouterMetaTools('session_123');
   * console.log(metaTools);
   * ```
   */
  async getRawToolRouterMetaTools(
    sessionId: string,
    options?: SchemaModifierOptions
  ): Promise<ToolList> {
    const tools = await this.client.toolRouter.session.tools(sessionId);
    let modifiedTools = tools.items.map(tool => this.transformToolCases(tool));
    // apply local modifiers if they are provided
    if (options?.modifySchema) {
      const modifier = options.modifySchema;
      if (typeof modifier === 'function') {
        const modifiedPromises = modifiedTools.map(tool =>
          modifier({
            toolSlug: tool.slug,
            toolkitSlug: tool.toolkit?.slug ?? 'unknown',
            schema: tool,
          })
        );
        modifiedTools = await Promise.all(modifiedPromises);
      } else {
        throw new ComposioInvalidModifierError('Invalid schema modifier. Not a function.');
      }
    }

    return modifiedTools;
  }

  /**
   * Retrieves a specific tool by its slug from the Composio API.
   *
   * This method fetches a single tool in raw format without provider-specific wrapping,
   * providing direct access to the tool's schema and metadata. Tool versions are controlled
   * at the Composio SDK initialization level through the `toolkitVersions` configuration.
   *
   * @param {string} slug - The unique identifier of the tool (e.g., 'GITHUB_GET_REPOS')
   * @param {GetRawComposioToolBySlugOptions} [options] - Optional configuration for tool retrieval
   * @param {TransformToolSchemaModifier} [options.modifySchema] - Function to transform the tool schema
   * @returns {Promise<Tool>} The requested tool with its complete schema and metadata
   *
   * @example
   * ```typescript
   * // Get a tool by slug
   * const tool = await composio.tools.getRawComposioToolBySlug('GITHUB_GET_REPOS');
   * console.log(tool.name, tool.description);
   *
   * // Get a tool with schema transformation
   * const customizedTool = await composio.tools.getRawComposioToolBySlug(
   *   'SLACK_SEND_MESSAGE',
   *   {
   *     modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
   *       return {
   *         ...schema,
   *         description: `Enhanced ${schema.description} with custom modifications`,
   *         customMetadata: {
   *           lastModified: new Date().toISOString(),
   *           toolkit: toolkitSlug
   *         }
   *       };
   *     }
   *   }
   * );
   *
   * // Get a custom tool (will check custom tools first)
   * const customTool = await composio.tools.getRawComposioToolBySlug('MY_CUSTOM_TOOL');
   *
   * // Access tool properties
   * const githubTool = await composio.tools.getRawComposioToolBySlug('GITHUB_CREATE_ISSUE');
   * console.log({
   *   slug: githubTool.slug,
   *   name: githubTool.name,
   *   toolkit: githubTool.toolkit?.name,
   *   version: githubTool.version,
   *   availableVersions: githubTool.availableVersions,
   *   inputParameters: githubTool.inputParameters
   * });
   * ```
   */
  async getRawComposioToolBySlug(slug: string, options?: SchemaModifierOptions): Promise<Tool> {
    // check if the tool is a custom tool
    const customTool = await this.customTools.getCustomToolBySlug(slug);
    if (customTool) {
      logger.debug(`Found ${slug} to be a custom tool`, JSON.stringify(customTool, null, 2));
      return customTool;
    } else {
      logger.debug(`Tool ${slug} is not a custom tool. Fetching from Composio API`);
    }
    // if not, fetch the tool from the Composio API
    let tool: ToolRetrieveResponse;
    try {
      tool = await this.client.tools.retrieve(slug, {
        toolkit_versions: this.toolkitVersions,
      });
    } catch (error) {
      throw new ComposioToolNotFoundError(`Unable to retrieve tool with slug ${slug}`, {
        cause: error,
      });
    }

    // change the case of the tool to camel case and apply default modifiers
    let [modifiedTool] = await this.applyDefaultSchemaModifiers([this.transformToolCases(tool)]);
    // apply local modifiers if they are provided
    if (options?.modifySchema) {
      const modifier = options.modifySchema;
      if (typeof modifier === 'function') {
        modifiedTool = await modifier({
          toolSlug: slug,
          toolkitSlug: modifiedTool.toolkit?.slug ?? 'unknown',
          schema: modifiedTool,
        });
      } else {
        throw new ComposioInvalidModifierError('Invalid schema modifier. Not a function.');
      }
    }
    return modifiedTool;
  }

  /**
   * Get a list of tools from Composio based on filters.
   * This method fetches the tools from the Composio API and wraps them using the provider.
   *
   * @param {string} userId - The user id to get the tools for
   * @param {ToolListParams} filters - The filters to apply when fetching tools
   * @param {ProviderOptions<TProvider>} [options] - Optional provider options including modifiers
   * @returns {Promise<ReturnType<T['wrapTools']>>} The wrapped tools collection
   *
   * @example
   * ```typescript
   * // Get tools from the GitHub toolkit
   * const tools = await composio.tools.get('default', {
   *   toolkits: ['github'],
   *   limit: 10
   * });
   *
   * // Get tools with search
   * const searchTools = await composio.tools.get('default', {
   *   search: 'user',
   *   limit: 10
   * });
   *
   * // Get a specific tool by slug
   * const hackerNewsUserTool = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
   *
   * // Get a tool with schema modifications
   * const tool = await composio.tools.get('default', 'GITHUB_GET_REPOS', {
   *   modifySchema: (toolSlug, toolkitSlug, schema) => {
   *     // Customize the tool schema
   *     return {...schema, description: 'Custom description'};
   *   }
   * });
   * ```
   */
  async get<T extends TProvider>(
    userId: string,
    filters: ToolListParams,
    options?: ProviderOptions<TProvider>
  ): Promise<ReturnType<T['wrapTools']>>;

  /**
   * Get a specific tool by its slug.
   * This method fetches the tool from the Composio API and wraps it using the provider.
   *
   * @param {string} userId - The user id to get the tool for
   * @param {string} slug - The slug of the tool to fetch
   * @param {ProviderOptions<TProvider>} [options] - Optional provider options including modifiers
   * @returns {Promise<ReturnType<T['wrapTools']>>} The wrapped tool
   *
   * @example
   * ```typescript
   * // Get a specific tool by slug
   * const hackerNewsUserTool = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
   *
   * // Get a tool with schema modifications
   * const tool = await composio.tools.get('default', 'GITHUB_GET_REPOS', {
   *   modifySchema: (toolSlug, toolkitSlug, schema) => {
   *     // Customize the tool schema
   *     return {...schema, description: 'Custom description'};
   *   }
   * });
   * ```
   */
  async get<T extends TProvider>(
    userId: string,
    slug: string,
    options?: ProviderOptions<TProvider>
  ): Promise<ReturnType<T['wrapTools']>>;

  /**
   * Get a tool or list of tools based on the provided arguments.
   * This is an implementation method that handles all overloads.
   *
   * @param {string} userId - The user id to get the tool(s) for
   * @param {ToolListParams | string} arg2 - Either a slug string or filters object
   * @param {ProviderOptions<TProvider> | ToolkitVersion} [arg3] - Optional provider options or version string
   * @param {ProviderOptions<TProvider>} [arg4] - Optional provider options (when arg3 is version)
   * @returns {Promise<TToolCollection>} The tool collection
   */
  async get(
    userId: string,
    arg2: ToolListParams | string,
    arg3?: ProviderOptions<TProvider>
  ): Promise<TToolCollection> {
    // Handle the two-parameter overloads
    const options = arg3 as ProviderOptions<TProvider>;

    // if the second argument is a string, get a single tool
    if (typeof arg2 === 'string') {
      const tool = await this.getRawComposioToolBySlug(arg2, {
        modifySchema: options?.modifySchema as TransformToolSchemaModifier,
      });
      return this.wrapToolsForProvider(
        userId,
        [tool],
        options as ExecuteToolModifiers
      ) as TToolCollection;
    } else {
      // if the second argument is an object, get a list of tools
      const tools = await this.getRawComposioTools(arg2, {
        modifySchema: options?.modifySchema as TransformToolSchemaModifier,
      });
      return this.wrapToolsForProvider(
        userId,
        tools,
        options as ExecuteToolModifiers
      ) as TToolCollection;
    }
  }
  /**
   * @internal
   * Creates a global execute tool function.
   * This function is used by providers to execute tools.
   * It skips the version check for provider controlled execution.
   * @returns {GlobalExecuteToolFn} The global execute tool function
   */
  private createExecuteFnForProviders(): GlobalExecuteToolFn {
    return async (slug: string, body: ToolExecuteParams, modifiers?: ExecuteToolModifiers) => {
      return await this.execute(
        slug,
        { ...body, dangerouslySkipVersionCheck: body.dangerouslySkipVersionCheck ?? true },
        modifiers
      );
    };
  }

  /**
   * @internal
   * Utility to wrap a given set of tools in the format expected by the provider
   *
   * @param userId - The user id to get the tools for
   * @param tools - The tools to wrap
   * @param modifiers - The modifiers to be applied to the tools
   * @returns The wrapped tools
   */
  wrapToolsForProvider<T extends TProvider>(
    userId: string,
    tools: Tool[],
    modifiers?: ExecuteToolModifiers
  ): ReturnType<T['wrapTools']> {
    const executeToolFn = this.createExecuteToolFn(userId, modifiers);
    return this.provider.wrapTools(tools, executeToolFn) as ReturnType<T['wrapTools']>;
  }

  /**
   * @internal
   * Utility to wrap a given set of tools in the format expected by the tool router
   *
   * @param {string} sessionId - The session id to execute the tool for
   * @param {Tool[]} tools - The tools to wrap
   * @param {SessionExecuteMetaModifiers} modifiers - The modifiers to apply to the tool
   * @returns {Tool[]} The wrapped tools
   */
  wrapToolsForToolRouter(
    sessionId: string,
    tools: Tool[],
    modifiers?: SessionExecuteMetaModifiers
  ): Tool[] {
    const executeToolFn = this.createExecuteToolFnForToolRouter(sessionId, modifiers);
    return this.provider.wrapTools(tools, executeToolFn) as Tool[];
  }

  /**
   * @internal
   * @description
   * Creates a function that executes a tool.
   * This function is used by agentic providers to execute the tool
   *
   * @param {string} userId - The user id
   * @param {ExecuteToolModifiers} modifiers - The modifiers to be applied to the tool
   * @returns {ExecuteToolFn} The execute tool function
   */
  private createExecuteToolFn(userId: string, modifiers?: ExecuteToolModifiers): ExecuteToolFn {
    const executeToolFn = async (toolSlug: string, input: Record<string, unknown>) => {
      return await this.execute(
        toolSlug,
        {
          userId,
          arguments: input,
          // dangerously skip version check for agentic tool execution via providers
          // this can be safe because most agentic flows users fetch latest version and then execute the tool
          dangerouslySkipVersionCheck: true,
        },
        modifiers
      );
    };
    return executeToolFn;
  }

  /**
   * @internal
   * Creates a function that executes a tool for a tool router session
   *
   * @param {string} sessionId - The session id to execute the tool for
   * @param {SessionExecuteMetaModifiers} modifiers - The modifiers to apply to the tool
   * @returns {ExecuteToolFn} The execute tool function
   */
  private createExecuteToolFnForToolRouter(
    sessionId: string,
    modifiers?: SessionExecuteMetaModifiers
  ): ExecuteToolFn {
    const executeToolFn = async (
      toolSlug: string,
      input: Record<string, unknown>
    ): Promise<ToolExecuteResponse> => {
      return await this.executeMetaTool(
        toolSlug,
        {
          sessionId,
          arguments: input,
        },
        modifiers
      );
    };
    return executeToolFn;
  }

  /**
   * @internal
   * Executes a composio tool via API without modifiers
   * @param tool - The tool to execute
   * @param body - The body of the tool execution
   * @returns The response from the tool execution
   */
  private async executeComposioTool(
    tool: Tool,
    body: ToolExecuteParams
  ): Promise<ToolExecuteResponse> {
    const toolkitVersion =
      body.version ?? getToolkitVersion(tool.toolkit?.slug ?? 'unknown', this.toolkitVersions);
    // if the version is latest and dangerouslySkipVersionCheck is not true, throw an error
    if (toolkitVersion === 'latest' && !body.dangerouslySkipVersionCheck) {
      throw new ComposioToolVersionRequiredError();
    }
    try {
      const result = await this.client.tools.execute(tool.slug, {
        allow_tracing: body.allowTracing,
        connected_account_id: body.connectedAccountId,
        custom_auth_params: body.customAuthParams,
        /**
         * @deprecated: customConnectionData
         * @description
         * This parameter is deprecated and will be removed in the future.
         * Please use custom_connection_data instead.
         *
         */
        custom_connection_data: body.customConnectionData,
        arguments: body.arguments,
        user_id: body.userId,
        version: toolkitVersion,
        text: body.text,
      });
      // transform the response to the ToolExecuteResponse format
      return this.transformToolExecuteResponse(result);
    } catch (error) {
      const toolError = handleToolExecutionError(tool.slug, error as Error);
      throw toolError;
    }
  }

  /**
   * Executes a given tool with the provided parameters.
   *
   * This method calls the Composio API or a custom tool handler to execute the tool and returns the response.
   * It automatically determines whether to use a custom tool or a Composio API tool based on the slug.
   *
   * **Version Control:**
   * By default, manual tool execution requires a specific toolkit version. If the version resolves to "latest",
   * the execution will throw a `ComposioToolVersionRequiredError` unless `dangerouslySkipVersionCheck` is set to `true`.
   * This helps prevent unexpected behavior when new toolkit versions are released.
   *
   * @param {string} slug - The slug/ID of the tool to be executed
   * @param {ToolExecuteParams} body - The parameters to be passed to the tool
   * @param {string} [body.version] - The specific version of the tool to execute (e.g., "20250909_00")
   * @param {boolean} [body.dangerouslySkipVersionCheck] - Skip version validation for "latest" version (use with caution)
   * @param {string} [body.userId] - The user ID to execute the tool for
   * @param {string} [body.connectedAccountId] - The connected account ID to use for authenticated tools
   * @param {Record<string, unknown>} [body.arguments] - The arguments to pass to the tool
   * @param {ExecuteToolModifiers} [modifiers] - Optional modifiers to transform the request or response
   * @returns {Promise<ToolExecuteResponse>} - The response from the tool execution
   *
   * @throws {ComposioCustomToolsNotInitializedError} If the CustomTools instance is not initialized
   * @throws {ComposioConnectedAccountNotFoundError} If the connected account is not found
   * @throws {ComposioToolNotFoundError} If the tool with the given slug is not found
   * @throws {ComposioToolVersionRequiredError} If version resolves to "latest" and dangerouslySkipVersionCheck is not true
   * @throws {ComposioToolExecutionError} If there is an error during tool execution
   *
   * @example Execute with a specific version (recommended for production)
   * ```typescript
   * const result = await composio.tools.execute('GITHUB_GET_REPOS', {
   *   userId: 'default',
   *   version: '20250909_00',
   *   arguments: { owner: 'composio' }
   * });
   * ```
   *
   * @example Execute with dangerouslySkipVersionCheck (not recommended for production)
   * ```typescript
   * const result = await composio.tools.execute('HACKERNEWS_GET_USER', {
   *   userId: 'default',
   *   arguments: { userId: 'pg' },
   *   dangerouslySkipVersionCheck: true // Allows execution with "latest" version
   * });
   * ```
   *
   * @example Execute with SDK-level toolkit versions configuration
   * ```typescript
   * // If toolkitVersions are set during Composio initialization, no need to pass version
   * const composio = new Composio({ toolkitVersions: { github: '20250909_00' } });
   * const result = await composio.tools.execute('GITHUB_GET_REPOS', {
   *   userId: 'default',
   *   arguments: { owner: 'composio' }
   * });
   * ```
   *
   * @example Execute with modifiers
   * ```typescript
   * const result = await composio.tools.execute('GITHUB_GET_ISSUES', {
   *   userId: 'default',
   *   version: '20250909_00',
   *   arguments: { owner: 'composio', repo: 'sdk' }
   * }, {
   *   beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
   *     console.log(`Executing ${toolSlug} from ${toolkitSlug}`);
   *     return params;
   *   },
   *   afterExecute: ({ toolSlug, toolkitSlug, result }) => {
   *     console.log(`Completed ${toolSlug}`);
   *     return result;
   *   }
   * });
   * ```
   */
  async execute(
    slug: string,
    body: ToolExecuteParams,
    modifiers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse> {
    if (!this.customTools) {
      throw new ComposioCustomToolsNotInitializedError(
        'CustomTools not initialized. Make sure Tools class is properly constructed.'
      );
    }

    const executeParams = ToolExecuteParamsSchema.safeParse(body);
    if (!executeParams.success) {
      throw new ValidationError('Invalid tool execute parameters', { cause: executeParams.error });
    }

    // Determine if it's a custom tool or composio tool
    const customTool = await this.customTools.getCustomToolBySlug(slug);
    const tool = customTool ?? (await this.getRawComposioToolBySlug(slug));
    const toolkitSlug = tool.toolkit?.slug ?? 'unknown';

    // Apply before execute modifiers
    const params = await this.applyBeforeExecuteModifiers(
      tool,
      {
        toolSlug: slug,
        toolkitSlug,
        params: executeParams.data,
      },
      modifiers?.beforeExecute
    );

    // Execute the tool (custom or composio)
    let result = customTool
      ? await this.customTools.executeCustomTool(customTool.slug, params)
      : await this.executeComposioTool(tool, params);

    // Apply after execute modifiers
    result = await this.applyAfterExecuteModifiers(
      tool,
      {
        toolSlug: slug,
        toolkitSlug,
        result,
      },
      modifiers?.afterExecute
    );

    return result;
  }

  /**
   * Executes a composio meta tool based on tool router session
   *
   * @param {string} toolSlug - The slug of the tool to execute
   * @param {ToolExecuteMetaParams} body - The execution parameters
   * @param {string} body.sessionId - The session id to execute the tool for
   * @param {Record<string, unknown>} body.arguments - The input to pass to the tool
   * @param {SessionExecuteMetaModifiers} modifiers - The modifiers to apply to the tool
   * @returns {Promise<ToolExecuteResponse>} The response from the tool execution
   */
  async executeMetaTool(
    toolSlug: string,
    body: ToolExecuteMetaParams,
    modifiers?: SessionExecuteMetaModifiers
  ): Promise<ToolExecuteResponse> {
    const executeMetaParams = ToolExecuteMetaParamsSchema.safeParse(body);
    if (!executeMetaParams.success) {
      throw new ValidationError('Invalid tool execute meta parameters', {
        cause: executeMetaParams.error,
      });
    }

    // Apply beforeExecute modifier if provided
    let modifiedParams = body.arguments ?? {};
    if (modifiers?.beforeExecute) {
      modifiedParams = await modifiers.beforeExecute({
        toolSlug,
        toolkitSlug: 'composio',
        sessionId: body.sessionId,
        params: modifiedParams,
      });
    }

    // Execute the meta tool
    const response = await this.client.toolRouter.session.executeMeta(body.sessionId, {
      // assert this because backend might keep adding more tool slugs
      slug: toolSlug as SessionExecuteMetaParams['slug'],
      arguments: modifiedParams,
    });

    // Prepare the result
    let result: ToolExecuteResponse = {
      data: response.data,
      error: response.error,
      successful: !response.error,
      logId: response.log_id,
    };

    // Apply afterExecute modifier if provided
    if (modifiers?.afterExecute) {
      result = await modifiers.afterExecute({
        toolSlug,
        toolkitSlug: 'composio',
        sessionId: body.sessionId,
        result,
      });
    }

    return result;
  }

  /**
   * Fetches the list of all available tools in the Composio SDK.
   *
   * This method is mostly used by the CLI to get the list of tools.
   * No filtering is done on the tools, the list is cached in the backend, no further optimization is required.
   * @returns {Promise<ToolRetrieveEnumResponse>} The complete list of all available tools with their metadata
   *
   * @example
   * ```typescript
   * // Get all available tools as an enum
   * const toolsEnum = await composio.tools.getToolsEnum();
   * console.log(toolsEnum.items);
   * ```
   */
  async getToolsEnum(): Promise<ToolRetrieveEnumResponse> {
    return this.client.tools.retrieveEnum();
  }

  /**
   * Fetches the input parameters for a given tool.
   *
   * This method is used to get the input parameters for a tool before executing it.
   *
   * @param {string} slug - The ID of the tool to find input for
   * @param {ToolGetInputParams} body - The parameters to be passed to the tool
   * @returns {Promise<ToolGetInputResponse>} The input parameters schema for the specified tool
   *
   * @example
   * ```typescript
   * // Get input parameters for a specific tool
   * const inputParams = await composio.tools.getInput('GITHUB_CREATE_ISSUE', {
   *   userId: 'default'
   * });
   * console.log(inputParams.schema);
   * ```
   */
  async getInput(slug: string, body: ToolGetInputParams): Promise<ToolGetInputResponse> {
    return this.client.tools.getInput(slug, body);
  }

  /**
   * Proxies a custom request to a toolkit/integration.
   *
   * This method allows sending custom requests to a specific toolkit or integration
   * when you need more flexibility than the standard tool execution methods provide.
   *
   * @param {ToolProxyParams} body - The parameters for the proxy request including toolkit slug and custom data
   * @returns {Promise<ToolProxyResponse>} The response from the proxied request
   *
   * @example
   * ```typescript
   * // Send a custom request to a toolkit
   * const response = await composio.tools.proxyExecute({
   *   toolkitSlug: 'github',
   *   userId: 'default',
   *   data: {
   *     endpoint: '/repos/owner/repo/issues',
   *     method: 'GET'
   *   }
   * });
   * console.log(response.data);
   * ```
   */
  async proxyExecute(body: ToolProxyParams): Promise<ToolProxyResponse> {
    const toolProxyParams = ToolProxyParamsSchema.safeParse(body);
    if (!toolProxyParams.success) {
      throw new ValidationError('Invalid tool proxy parameters', { cause: toolProxyParams.error });
    }
    // convert the headers and query to the composio format
    // { name: string, type: 'header' | 'query', value: string }
    const parameters: ComposioToolProxyParams.Parameter[] = [];
    const parameterTypes = {
      header: 'header',
      query: 'query',
    } as const;

    if (toolProxyParams.data.parameters) {
      parameters.push(
        ...(toolProxyParams.data.parameters ?? []).map(value => ({
          name: value.name,
          type: value.in === 'header' ? parameterTypes.header : parameterTypes.query,
          value: value.value.toString(),
        }))
      );
    }

    return this.client.tools.proxy({
      endpoint: toolProxyParams.data.endpoint,
      method: toolProxyParams.data.method,
      body: toolProxyParams.data.body,
      connected_account_id: toolProxyParams.data.connectedAccountId,
      parameters: parameters,
      /**
       * @deprecated: customConnectionData
       * @description
       * This parameter is deprecated and will be removed in the future.
       * Please use custom_auth_params instead.
       *
       */
      // @ts-ignore
      custom_connection_data: toolProxyParams.data.customConnectionData,
    });
  }

  /**
   * Creates a custom tool that can be used within the Composio SDK.
   *
   * Custom tools allow you to extend the functionality of Composio with your own implementations
   * while keeping a consistent interface for both built-in and custom tools.
   *
   * @param {CustomToolOptions} body - The configuration for the custom tool
   * @returns {Promise<Tool>} The created custom tool
   *
   * @example
   * ```typescript
   * // creating a custom tool with a toolkit
   * await composio.tools.createCustomTool({
   *   name: 'My Custom Tool',
   *   description: 'A custom tool that does something specific',
   *   slug: 'MY_CUSTOM_TOOL',
   *   userId: 'default',
   *   connectedAccountId: '123',
   *   toolkitSlug: 'github',
   *   inputParameters: z.object({
   *     param1: z.string().describe('First parameter'),
   *   }),
   *   execute: async (input, connectionConfig, executeToolRequest) => {
   *     // Custom logic here
   *     return { data: { result: 'Success!' } };
   *   }
   * });
   * ```
   *
   * @example
   * ```typescript
   * // creating a custom tool without a toolkit
   * await composio.tools.createCustomTool({
   *   name: 'My Custom Tool',
   *   description: 'A custom tool that does something specific',
   *   slug: 'MY_CUSTOM_TOOL',
   *   inputParameters: z.object({
   *     param1: z.string().describe('First parameter'),
   *   }),
   *   execute: async (input) => {
   *     // Custom logic here
   *     return { data: { result: 'Success!' } };
   *   }
   * });
   */
  async createCustomTool<T extends CustomToolInputParameter>(
    body: CustomToolOptions<T>
  ): Promise<Tool> {
    return this.customTools.createTool(body);
  }
}
