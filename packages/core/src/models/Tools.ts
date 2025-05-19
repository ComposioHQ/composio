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
} from '../types/tool.types';
import {
  ToolGetInputParams,
  ToolGetInputResponse,
  ToolProxyParams,
  ToolProxyResponse,
  ToolRetrieveEnumResponse,
  ToolRetrieveResponse,
  ToolListResponse as ComposioToolListResponse,
  ToolExecuteResponse as ComposioToolExecuteResponse,
} from '@composio/client/resources/tools';
import { CustomTools } from './CustomTools';
import { CustomToolOptions } from '../types/customTool.types';
import {
  ExecuteToolModifiers,
  ToolsetOptions,
  TransformToolSchemaModifier,
} from '../types/modifiers.types';
import { BaseComposioToolset } from '../toolset/BaseToolset';
import logger from '../utils/logger';
import { ExecuteToolFn } from '../types/toolset.types';
import {
  ComposioCustomToolsNotInitializedError,
  ComposioInvalidModifierError,
  ComposioToolExecutionError,
  ComposioToolNotFoundError,
  ComposioToolsetNotDefinedError,
} from '../errors/ToolErrors';
import { ValidationError } from '../errors/ValidationError';

/**
 * This class is used to manage tools in the Composio SDK.
 * It provides methods to list, get, and execute tools.
 */
export class Tools<
  TToolCollection,
  TTool,
  TToolset extends BaseComposioToolset<TToolCollection, TTool>,
> {
  private client: ComposioClient;
  private readonly customTools: CustomTools;
  private toolset: TToolset;

  constructor(client: ComposioClient, toolset: TToolset) {
    if (!client) {
      throw new Error('ComposioClient is required');
    }
    if (!toolset) {
      throw new ComposioToolsetNotDefinedError('Toolset not passed into Tools instance');
    }

    this.client = client;
    this.customTools = new CustomTools(client);
    this.toolset = toolset;

    // Bind methods that use customTools to ensure correct 'this' context
    this.execute = this.execute.bind(this);
    this.getComposioToolBySlug = this.getComposioToolBySlug.bind(this);
    this.getComposioTools = this.getComposioTools.bind(this);
  }

  /**
   * Transform the tool cases
   * @param {ToolRetrieveResponse | ComposioToolListResponse['items'][0]} tool - The tool to transform
   * @returns {Tool} The transformed tool
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
   * Transform the tool execute response to camelcase
   * @param {ComposioToolExecuteResponse} response - The response to transform
   * @returns {ToolExecuteResponse} The transformed response
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
    const tool = await this.getComposioToolBySlug(userId, toolSlug);
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
   * Lists all tools available in the Composio SDK as well as custom tools.
   * This method fetches the tools from the Composio API and wraps them using the toolset.
   * @returns {ToolList} List of tools
   */
  async getComposioTools(
    userId: string,
    query: ToolListParams = {},
    modifier?: TransformToolSchemaModifier
  ): Promise<ToolList> {
    const queryParams = ToolListParamsSchema.safeParse(query);
    if (queryParams.error) {
      throw new ValidationError(queryParams.error);
    }

    const tools = await this.client.tools.list({
      tool_slugs: queryParams.data.tools,
      toolkit_slug: queryParams.data.toolkits?.join(','),
      cursor: queryParams.data.cursor,
      important: queryParams.data.important,
      limit: queryParams.data.limit,
      search: queryParams.data.search,
    });

    if (!tools) {
      return [];
    }
    const caseTransformedTools = tools.items.map(tool => this.transformToolCases(tool));
    // @TODO add checks for connectedAccounts for fetched tools
    // const connectedAccountExists = await this.checkIfConnectedAccountExistsForTools(
    //   userId,
    //   caseTransformedTools
    // );
    // if (!connectedAccountExists) {
    //   console.warn('No connected accounts found for the given tools');
    // }

    const customTools = await this.customTools.getCustomTools({
      toolSlugs: queryParams.data.tools,
    });

    let modifiedTools = [...caseTransformedTools, ...customTools];

    // apply local modifiers if they are provided
    if (modifier) {
      if (typeof modifier === 'function') {
        modifiedTools = modifiedTools.map(tool => {
          return modifier(tool.slug, tool.toolkit?.slug || 'unkown', tool);
        });
      } else {
        throw new ComposioInvalidModifierError('Invalid schema modifier. Not a function.');
      }
    }

    return modifiedTools;
  }

  /**
   * Retrieves a tool by its Slug.
   * @param slug The ID of the tool to be retrieved
   * @returns {Promise<Tool>} The tool
   *
   * @example
   * ```ts
   * const tool = await composio.tools.getComposioToolBySlug('default', 'github');
   * ```
   */
  async getComposioToolBySlug(
    userId: string,
    slug: string,
    modifier?: TransformToolSchemaModifier
  ): Promise<Tool> {
    // check if the tool is a custom tool
    const customTool = await this.customTools.getCustomToolBySlug(slug);
    if (customTool) {
      return customTool;
    }
    // if not, fetch the tool from the Composio API
    const tool = await this.client.tools.retrieve(slug);
    if (!tool) {
      throw new ComposioToolNotFoundError(
        `[getComposioToolBySlug] Tool with slug ${slug} not found`
      );
    }
    // change the case of the tool to camel case
    let modifiedToool = this.transformToolCases(tool);
    // apply local modifiers if they are provided
    if (modifier) {
      if (typeof modifier === 'function') {
        modifiedToool = modifier(slug, modifiedToool.toolkit?.slug || 'unkown', modifiedToool);
      } else {
        throw new ComposioInvalidModifierError('Invalid schema modifier. Not a function.');
      }
    }
    return modifiedToool;
  }

  /**
   * Get a tool by its slug
   * @param userId - The user id
   * @param slug - The slug of the tool
   * @param options - The options for the tool
   * @returns The tool
   *
   * @example
   * ```ts
   * const tool = await composio.tools.get('default', 'github');
   * ```
   */
  async get<T extends TToolset>(
    userId: string,
    slug: string,
    options?: ToolsetOptions<TToolset>
  ): Promise<ReturnType<T['wrapTool']>>;

  /**
   * Get a list of tools by their slugs
   * @param userId - The user id
   * @param filters - The filters for the tools
   * @param options - The options for the tools
   * @returns The tools
   *
   * @example
   * ```ts
   * const tools = await composio.tools.get('default', {
   *   tools: ['github'],
   * });
   * ```
   */
  async get<T extends TToolset>(
    userId: string,
    filters: ToolListParams,
    options?: ToolsetOptions<TToolset>
  ): Promise<ReturnType<T['wrapTools']>>;

  /**
   * Get a tool by its slug
   * @param userId - The user id
   * @param arg2 - The slug of the tool or the filters for the tools
   * @param options - The options for the tools
   * @returns The tool or the tools
   */
  async get(
    userId: string,
    arg2: ToolListParams | string,
    options?: ToolsetOptions<TToolset>
  ): Promise<TTool | TToolCollection> {
    // create the execute tool function
    const executeToolFn = this.createExecuteToolFn(userId, options as ExecuteToolModifiers);
    // if the first argument is a string, get a single tool
    if (typeof arg2 === 'string') {
      const tool = await this.getComposioToolBySlug(userId, arg2, options?.modifyToolSchema);
      return this.toolset.wrapTool(tool, executeToolFn) as TTool;
    } else {
      // if the first argument is an object, get a list of tools
      const tools = await this.getComposioTools(userId, arg2, options?.modifyToolSchema);
      return this.toolset.wrapTools(tools, executeToolFn) as TToolCollection;
    }
  }

  /**
   * @internal
   * Creates a function that executes a tool.
   * This function is used by agentic the toolsets to execute the tool
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
    if (modifiers?.beforeToolExecute) {
      if (typeof modifiers.beforeToolExecute === 'function') {
        body = modifiers.beforeToolExecute(tool.slug, 'unkown', body);
      } else {
        throw new ComposioInvalidModifierError(
          'Invalid beforeToolExecute modifier. Not a function.'
        );
      }
    }

    let result = await this.customTools.executeCustomTool(tool.slug, body, {
      userId: body.userId || 'default',
      connectedAccountId: body.connectedAccountId,
    });

    if (modifiers?.afterToolExecute) {
      if (typeof modifiers.afterToolExecute === 'function') {
        result = modifiers.afterToolExecute(tool.slug, 'unkown', result);
      } else {
        throw new ComposioInvalidModifierError(
          'Invalid afterToolExecute modifier. Not a function.'
        );
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
    if (modifiers?.beforeToolExecute) {
      if (typeof modifiers.beforeToolExecute === 'function') {
        body = modifiers.beforeToolExecute(tool.slug, tool.toolkit?.slug || 'unkown', body);
      } else {
        throw new ComposioInvalidModifierError(
          'Invalid beforeToolExecute modifier. Not a function.'
        );
      }
    }
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
      entity_id: body.userId,
      version: body.version,
      text: body.text,
    });
    // apply transformations to the response
    result = this.transformToolExecuteResponse(result);

    // apply local modifiers if they are provided
    if (modifiers?.afterToolExecute) {
      if (typeof modifiers.afterToolExecute === 'function') {
        result = modifiers.afterToolExecute(tool.slug, tool.toolkit?.slug || 'unkown', result);
      } else {
        throw new ComposioInvalidModifierError(
          'Invalid afterToolExecute modifier. Not a function.'
        );
      }
    }
    return result;
  }

  /**
   * Exectes a given tool with the provided parameters.
   *
   * This method calls the Composio API to execute the tool and returns the response.
   *
   * @param {string} slug - The ID of the tool to be executed
   * @param {ToolExecuteParams} body - The parameters to be passed to the tool
   * @returns {Promise<ToolExecuteResponse>} - The response from the tool execution
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
        const composioTool = await this.getComposioToolBySlug(body.userId, slug);
        if (!composioTool) {
          throw new ComposioToolNotFoundError(`Tool with slug ${slug} not found`);
        }
        return this.handleComposioToolExecution(composioTool, body, modifiers);
      }
    } catch (error) {
      throw new ComposioToolExecutionError(error as Error, `Error executing tool ${slug}`, {
        toolSlug: slug,
        body,
      });
    }
  }

  /**
   * Fetches the list of all available tools in the Composio SDK.
   *
   * This method is mostly used by the CLI  to get the list of tools.
   * No filtering is done on the tools, the list is cached in the backend, no further optimization is required.
   * @returns {string} - The list of all available tools as a string
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
   * @returns
   */
  async getInput(slug: string, body: ToolGetInputParams): Promise<ToolGetInputResponse> {
    return this.client.tools.getInput(slug, body);
  }

  /**
   * Proxies a custom request to a toolkit/integration
   * @param body
   * @returns
   */
  async proxyExecute(body: ToolProxyParams): Promise<ToolProxyResponse> {
    return this.client.tools.proxy(body);
  }

  /**
   * Execute a custom tool
   * @param body
   * @returns
   */
  async createCustomTool(body: CustomToolOptions): Promise<Tool> {
    return this.customTools.createTool(body);
  }
}
