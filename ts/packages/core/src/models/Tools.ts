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
  ProviderOptions,
  TransformToolSchemaModifier,
} from '../types/modifiers.types';
import { BaseComposioProvider } from '../provider/BaseProvider';
import logger from '../utils/logger';
import { ExecuteToolFn } from '../types/provider.types';
import {
  ComposioCustomToolsNotInitializedError,
  ComposioInvalidModifierError,
  ComposioToolExecutionError,
  ComposioToolNotFoundError,
  ComposioProviderNotDefinedError,
} from '../errors/ToolErrors';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { FileToolModifier } from '../utils/modifiers/FileToolModifier';
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

  constructor(
    client: ComposioClient,
    provider: TProvider,
    options?: { autoUploadDownloadFiles: boolean }
  ) {
    if (!client) {
      throw new Error('ComposioClient is required');
    }
    if (!provider) {
      throw new ComposioProviderNotDefinedError('Provider not passed into Tools instance');
    }

    this.client = client;
    this.customTools = new CustomTools(client);
    this.provider = provider;
    this.autoUploadDownloadFiles = options?.autoUploadDownloadFiles ?? true;
    // Bind the execute method to ensure correct 'this' context
    this.execute = this.execute.bind(this);
    // Set the execute method for the provider
    this.provider._setExecuteToolFn(this.execute);

    // Bind methods that use customTools to ensure correct 'this' context
    this.getRawComposioToolBySlug = this.getRawComposioToolBySlug.bind(this);
    this.getRawComposioTools = this.getRawComposioTools.bind(this);

    telemetry.instrument(this);
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
   * Check if the connected account exists for the given tools.
   * @param {string} userId - The user id.
   * @param {ToolList} tools - The tools to check.
   * @returns {Promise<boolean>} True if the connected account exists for the given tools, false otherwise.
   */
  private async checkIfConnectedAccountExistsForTools(
    userIds: string[],
    tools: ToolList
  ): Promise<boolean> {
    // @TODO: Filter out tools that don't require a connected account

    // if no tools, return true as no connections needed
    if (!tools.length) {
      return true;
    }
    const connectedAccounts = await this.client.connectedAccounts.list({
      user_ids: userIds,
    });
    // if no connected accounts, return false
    if (connectedAccounts.items.length === 0) {
      return false;
    }

    // create a map of toolkit slugs that have connected accounts
    const connectedToolkitSlugs = connectedAccounts.items.reduce(
      (acc, account) => {
        if (account.toolkit.slug) {
          acc[account.toolkit.slug] = true;
        }
        return acc;
      },
      {} as Record<string, boolean>
    );

    // create a map of tool slugs
    const toolSlugs = tools.reduce(
      (acc, tool) => {
        acc[tool.slug] = true;
        return acc;
      },
      {} as Record<string, boolean>
    );

    // check if each tool's toolkit has a connected account
    for (const tool of Object.keys(toolSlugs)) {
      if (!connectedToolkitSlugs[tool]) {
        logger.warn(`Tool ${tool} requires a connected account but no connected account was found`);
        return false;
      }
    }
    return true;
  }

  /**
   * Get the connected account id for a given tool
   * @param {string} userId - The user id
   * @param {string} toolSlug - The tool slug
   * @returns {Promise<string | null>} The connected account id or null if the toolkit is a no auth app
   */
  private async getConnectedAccountIdForTool(
    userId: string,
    toolSlug: string
  ): Promise<string | null> {
    const tool = await this.getRawComposioToolBySlug(toolSlug);
    if (!tool.toolkit) {
      throw new Error(`Unable to find toolkit for tool ${toolSlug}`);
    }

    const toolkit = await this.client.toolkits.retrieve(tool.toolkit.slug);
    if (!toolkit) {
      throw new Error(`Unable to find toolkit for tool ${toolSlug}`);
    }

    // check if the toolkit is a no auth app
    const isNoAuthApp = toolkit.auth_config_details?.some(
      authConfigDetails => authConfigDetails.mode === 'NO_AUTH'
    );
    // if the toolkit is not a no auth app, fetch connected accounts
    if (!isNoAuthApp) {
      const connectedAccounts = await this.client.connectedAccounts.list({
        user_ids: [userId],
        toolkit_slugs: [tool.toolkit.slug],
      });
      // if no connected accounts, throw an error
      if (connectedAccounts.items.length === 0) {
        throw new Error('No connected accounts found');
      }
      // by default, use the first connected account
      // @TODO: Add support for multiple connected accounts
      logger.warn(
        `Using the first connected account for tool ${toolSlug}. To change this behaviour please explicitly pass a connectedAccountId for the tool`
      );
      return connectedAccounts.items[0].id;
    }
    // if the toolkit is a no auth app, return null
    return null;
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
   *
   * @param {ToolListParams} [query={}] - Optional query parameters to filter the tools
   * @param {TransformToolSchemaModifier} [modifier] - Optional function to transform tool schemas
   * @returns {Promise<ToolList>} List of tools matching the query criteria
   *
   * @example
   * ```typescript
   * // Get all tools
   * const tools = await composio.tools.getRawComposioTools();
   *
   * // Get tools with filters
   * const githubTools = await composio.tools.getRawComposioTools({
   *   toolkits: ['github'],
   *   limit: 10
   * });
   *
   * // Get tools with schema transformation
   * const tools = await composio.tools.getRawComposioTools({},
   *   (toolSlug, toolkitSlug, tool) => {
   *     // Add custom properties to tool schema
   *     return {...tool, customProperty: 'value'};
   *   }
   * );
   * ```
   */
  async getRawComposioTools(
    query: ToolListParams,
    modifier?: TransformToolSchemaModifier
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
    if (modifier) {
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
   * Retrieves a tool by its Slug.
   * This method is used to get the raw tools from the composio API.
   * @param slug The ID of the tool to be retrieved
   * @returns {Promise<Tool>} The tool
   *
   * @example
   * ```ts
   * const tool = await composio.tools.getRawComposioToolBySlug('github');
   * ```
   */
  async getRawComposioToolBySlug(
    slug: string,
    modifier?: TransformToolSchemaModifier
  ): Promise<Tool> {
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
      tool = await this.client.tools.retrieve(slug);
    } catch (error) {
      throw new ComposioToolNotFoundError(`Unable to retrieve tool with slug ${slug}`, {
        cause: error,
      });
    }

    // change the case of the tool to camel case and apply default modifiers
    let [modifiedTool] = await this.applyDefaultSchemaModifiers([this.transformToolCases(tool)]);
    // apply local modifiers if they are provided
    if (modifier) {
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
   * This is an implementation method that handles both overloads.
   *
   * @param {string} userId - The user id to get the tool(s) for
   * @param {ToolListParams | string} arg2 - Either a slug string or filters object
   * @param {ProviderOptions<TProvider>} [options] - Optional provider options
   * @returns {Promise<TToolCollection>} The tool collection
   */
  async get(
    userId: string,
    arg2: ToolListParams | string,
    options?: ProviderOptions<TProvider>
  ): Promise<TToolCollection> {
    // create the execute tool function
    const executeToolFn = this.createExecuteToolFn(userId, options as ExecuteToolModifiers);
    // if the first argument is a string, get a single tool
    if (typeof arg2 === 'string') {
      const tool = await this.getRawComposioToolBySlug(arg2, options?.modifySchema);
      return this.provider.wrapTools([tool], executeToolFn) as TToolCollection;
    } else {
      // if the first argument is an object, get a list of tools
      const tools = await this.getRawComposioTools(arg2, options?.modifySchema);
      return this.provider.wrapTools(tools, executeToolFn) as TToolCollection;
    }
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
        },
        modifiers
      );
    };
    return executeToolFn;
  }

  /**
   * @internal
   * Handles the execution of a custom tool
   * @param tool - The tool to execute
   * @param body - The body of the tool execution
   * @param modifiers - The modifiers to be applied to the tool execution
   * @returns The response from the tool execution
   */
  private async handleCustomToolExecution(
    tool: Tool,
    body: ToolExecuteParams,
    modifiers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse> {
    if (modifiers?.beforeExecute) {
      if (typeof modifiers.beforeExecute === 'function') {
        body = await modifiers.beforeExecute({
          toolSlug: tool.slug,
          toolkitSlug: tool.toolkit?.slug ?? 'unknown',
          params: body,
        });
      } else {
        throw new ComposioInvalidModifierError('Invalid beforeExecute modifier. Not a function.');
      }
    }

    let result = await this.customTools.executeCustomTool(tool.slug, body);

    if (modifiers?.afterExecute) {
      if (typeof modifiers.afterExecute === 'function') {
        result = await modifiers.afterExecute({
          toolSlug: tool.slug,
          toolkitSlug: tool.toolkit?.slug ?? 'unknown',
          result,
        });
      } else {
        throw new ComposioInvalidModifierError('Invalid afterExecute modifier. Not a function.');
      }
    }

    return result;
  }

  /**
   * @internal
   * Handles the execution of a composio tool
   * @param tool - The tool to execute
   * @param body - The body of the tool execution
   * @param modifiers - The modifiers to be applied to the tool execution
   * @returns The response from the tool execution
   */
  private async handleComposioToolExecution(
    tool: Tool,
    body: ToolExecuteParams,
    modifiers?: ExecuteToolModifiers
  ): Promise<ToolExecuteResponse> {
    // apply before execute modifiers
    body = await this.applyBeforeExecuteModifiers(
      tool,
      {
        toolSlug: tool.slug,
        toolkitSlug: tool.toolkit?.slug ?? 'unknown',
        params: body,
      },
      modifiers?.beforeExecute
    );

    // fetch connected accounts if doesn't exist
    let connectedAccountId = body.connectedAccountId;
    if (!connectedAccountId) {
      connectedAccountId =
        (await this.getConnectedAccountIdForTool(body.userId, tool.slug)) || undefined;
    }

    let result = await this.client.tools.execute(tool.slug, {
      allow_tracing: body.allowTracing,
      connected_account_id: body.connectedAccountId,
      custom_auth_params: body.customAuthParams,
      arguments: body.arguments,
      user_id: body.userId,
      version: body.version,
      text: body.text,
    });
    // apply transformations to the response
    result = this.transformToolExecuteResponse(result);

    result = await this.applyAfterExecuteModifiers(
      tool,
      {
        toolSlug: tool.slug,
        toolkitSlug: tool.toolkit?.slug ?? 'unknown',
        result,
      },
      modifiers?.afterExecute
    );
    return result;
  }

  /**
   * Executes a given tool with the provided parameters.
   *
   * This method calls the Composio API or a custom tool handler to execute the tool and returns the response.
   * It automatically determines whether to use a custom tool or a Composio API tool based on the slug.
   *
   * @param {string} slug - The slug/ID of the tool to be executed
   * @param {ToolExecuteParams} body - The parameters to be passed to the tool
   * @param {ExecuteToolModifiers} [modifiers] - Optional modifiers to transform the request or response
   * @returns {Promise<ToolExecuteResponse>} - The response from the tool execution
   *
   * @throws {ComposioCustomToolsNotInitializedError} If the CustomTools instance is not initialized
   * @throws {ComposioToolNotFoundError} If the tool with the given slug is not found
   * @throws {ComposioToolExecutionError} If there is an error during tool execution
   *
   * @example
   * ```typescript
   * // Execute a Composio API tool
   * const result = await composio.tools.execute('HACKERNEWS_GET_USER', {
   *   userId: 'default',
   *   arguments: { userId: 'pg' }
   * });
   *
   * // Execute with modifiers
   * const result = await composio.tools.execute('GITHUB_GET_ISSUES', {
   *   userId: 'default',
   *   arguments: { owner: 'composio', repo: 'sdk' }
   * }, {
   *   beforeExecute: (toolSlug, toolkitSlug, params) => {
   *     // Modify params before execution
   *     return params;
   *   },
   *   afterExecute: (toolSlug, toolkitSlug, result) => {
   *     // Transform result after execution
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

    try {
      const customTool = await this.customTools.getCustomToolBySlug(slug);
      if (customTool) {
        // handle custom tool execution
        return this.handleCustomToolExecution(customTool, body, modifiers);
      } else {
        // handle composio tool execution
        const composioTool = await this.getRawComposioToolBySlug(slug);
        if (!composioTool) {
          throw new ComposioToolNotFoundError(`Tool with slug ${slug} not found`);
        }
        return this.handleComposioToolExecution(composioTool, body, modifiers);
      }
    } catch (error) {
      throw new ComposioToolExecutionError(`Error executing tool ${slug}`, {
        originalError: error as Error,
        meta: {
          toolSlug: slug,
          body,
        },
      });
    }
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
