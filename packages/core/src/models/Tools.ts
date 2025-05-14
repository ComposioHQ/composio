import ComposioClient from '@composio/client';
import {
  Tool,
  ToolExecuteParams,
  ToolListParamsSchema,
  ToolExecuteResponse,
  ToolList,
  ToolSchema,
  ToolExecuteResponseSchema,
} from '../types/tool.types';
import {
  ToolGetInputParams,
  ToolGetInputResponse,
  ToolListParams,
  ToolProxyParams,
  ToolProxyResponse,
  ToolRetrieveEnumResponse,
  ToolRetrieveResponse,
  ToolListResponse as ComposioToolListResponse,
  ToolExecuteResponse as ComposioToolExecuteResponse,
} from '@composio/client/resources/tools';
import { CustomTools } from './CustomTools';
import { CustomToolOptions } from '../types/customTool.types';
import { ExecuteToolModifiersParams, TransformToolSchemaModifier } from '../types/modifiers.types';

/**
 * This class is used to manage tools in the Composio SDK.
 * It provides methods to list, get, and execute tools.
 */
export class Tools {
  private client: ComposioClient;
  customTools: CustomTools;

  constructor(client: ComposioClient) {
    this.client = client;
    this.customTools = new CustomTools(client);
  }

  private transformToolCases(
    tool: ToolRetrieveResponse | ComposioToolListResponse['items'][0]
  ): Tool {
    return ToolSchema.parse({
      ...tool,
      inputParameters: tool.input_parameters,
      outputParameters: tool.output_parameters,
    });
  }

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
   * Lists all tools available in the Composio SDK as well as custom tools.
   * This method fetches the tools from the Composio API and wraps them using the toolset.
   * @returns {ToolList} List of tools
   */
  async getTools(
    query: ToolListParams = {},
    modifier?: TransformToolSchemaModifier
  ): Promise<ToolList> {
    const queryParams = ToolListParamsSchema.safeParse(query);
    if (queryParams.error) {
      throw new Error(JSON.stringify(queryParams.error.flatten()));
    }

    const tools = await this.client.tools.list({
      cursor: queryParams.data.cursor,
      important: queryParams.data.important,
      limit: queryParams.data.limit,
      search: queryParams.data.search,
      toolkit_slug: queryParams.data.toolkitSlug,
      tool_slugs: queryParams.data.toolSlugs?.join(','),
    });
    if (!tools) {
      return [];
    }
    const customTools = await this.customTools.getCustomTools({
      toolSlugs: queryParams.data.toolSlugs,
    });

    let modifiedTools = [...tools.items.map(tool => this.transformToolCases(tool)), ...customTools];

    // apply local modifiers if they are provided
    if (modifier) {
      if (typeof modifier === 'function') {
        modifiedTools = modifiedTools.map(tool => {
          return modifier(tool.slug, tool);
        });
      } else {
        throw new Error('Invalid schema modifier. Not a function.');
      }
    }

    return modifiedTools;
  }

  /**
   * Retrieves a tool by its Slug.
   * @param slug The ID of the tool to be retrieved
   * @returns {Promise<Tool>} The tool
   */
  async getToolBySlug(slug: string, modifier?: TransformToolSchemaModifier): Promise<Tool> {
    // check if the tool is a custom tool
    const customTool = await this.customTools.getCustomToolBySlug(slug);
    if (customTool) {
      return customTool;
    }
    // if not, fetch the tool from the Composio API
    const tool = await this.client.tools.retrieve(slug);
    if (!tool) {
      throw new Error(`Tool with slug ${slug} not found`);
    }
    // change the case of the tool to camel case
    let modifiedToool = this.transformToolCases(tool);
    // apply local modifiers if they are provided
    if (modifier) {
      if (typeof modifier === 'function') {
        modifiedToool = modifier(slug, modifiedToool);
      } else {
        throw new Error('Invalid schema modifier. Not a function.');
      }
    }
    return modifiedToool;
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
    modifiers?: ExecuteToolModifiersParams
  ): Promise<ToolExecuteResponse> {
    // apply local modifiers if they are provided
    if (modifiers && modifiers.beforeToolExecute) {
      if (typeof modifiers.beforeToolExecute === 'function') {
        body = modifiers.beforeToolExecute(slug, body);
      } else {
        throw new Error('Invalid beforeToolExecute modifier. Not a function.');
      }
    }

    let result: ToolExecuteResponse;
    // check if the tool is a custom tool
    const customTool = await this.customTools.getCustomToolBySlug(slug);
    if (customTool) {
      result = await this.customTools.executeCustomTool(slug, body, {
        userId: body.userId || 'default',
        connectedAccountId: body.connectedAccountId,
      });
    } else {
      result = await this.client.tools.execute(slug, {
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
    }

    // apply local modifiers if they are provided
    if (modifiers && modifiers.afterToolExecute) {
      if (typeof modifiers.afterToolExecute === 'function') {
        result = modifiers.afterToolExecute(slug, result);
      } else {
        throw new Error('Invalid afterToolExecute modifier. Not a function.');
      }
    }

    return result;
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
