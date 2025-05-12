import ComposioClient from '@composio/client';
import {
  Tool,
  ToolExecuteParams,
  ToolListParamsSchema,
  ToolExecuteResponse,
  ToolList,
  ToolListResponse,
  ToolSchema,
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
} from '@composio/client/resources/tools';
import { Modifiers } from './Modifiers';
import { CustomTools } from './CustomTools';
import { CustomToolOptions } from '../types/customTool.types';
import {
  ExecuteToolModifiersParams,
  GlobalAfterToolExecuteModifier,
  GlobalBeforeToolExecuteModifier,
  GlobalTransformToolSchemaModifier,
} from '../types/modifiers.types';
import { ToolkitListResponse } from '@composio/client/resources/toolkits';

/**
 * This class is used to manage tools in the Composio SDK.
 * It provides methods to list, get, and execute tools.
 */
export class Tools {
  private client: ComposioClient;
  private modifiers: Modifiers;
  private customTools: CustomTools;

  constructor(client: ComposioClient, modifiers: Modifiers) {
    this.client = client;
    this.modifiers = modifiers || new Modifiers();
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

  /**
   * Lists all tools available in the Composio SDK as well as custom tools.
   * This method fetches the tools from the Composio API and wraps them using the toolset.
   * @returns {ToolList} List of tools
   */
  async getTools(
    query: ToolListParams = {},
    modifier?: GlobalTransformToolSchemaModifier
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

    const composioToolList = [
      ...tools.items.map(tool => this.transformToolCases(tool)),
      ...customTools,
    ];

    let modifiedTools = composioToolList.map(tool => {
      return this.modifiers.applyTransformToolSchema(tool.slug, {
        ...tool,
        inputParameters: tool.inputParameters,
        outputParameters: tool.outputParameters,
      });
    });

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
  async getToolBySlug(slug: string, modifier?: GlobalTransformToolSchemaModifier): Promise<Tool> {
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
    const casedTool = this.transformToolCases(tool);
    // apply the global modifiers
    let modifiedTool = this.modifiers.applyTransformToolSchema(slug, casedTool);
    // apply local modifiers if they are provided
    if (modifier) {
      if (typeof modifier === 'function') {
        modifiedTool = modifier(slug, modifiedTool);
      } else {
        throw new Error('Invalid schema modifier. Not a function.');
      }
    }
    return modifiedTool;
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
    // before tool execute modifier, apply all the global modifiers
    let modifiedBody = this.modifiers.applyBeforeToolExecute(slug, body);

    // apply local modifiers if they are provided
    if (modifiers && modifiers.beforeToolExecute) {
      if (typeof modifiers.beforeToolExecute === 'function') {
        modifiedBody = modifiers.beforeToolExecute(slug, modifiedBody);
      } else {
        throw new Error('Invalid beforeToolExecute modifier. Not a function.');
      }
    }

    let result = await this.client.tools.execute(slug, {
      allow_tracing: modifiedBody.allowTracing,
      connected_account_id: modifiedBody.connectedAccountId,
      custom_auth_params: modifiedBody.customAuthParams,
      arguments: modifiedBody.arguments,
      entity_id: modifiedBody.userId,
      version: modifiedBody.version,
      text: modifiedBody.text,
    });
    // apply gloafter tool execute modifier
    result = this.modifiers.applyAfterToolExecute(slug, {
      data: result.data,
      error: result.error,
      successful: result.successful,
      logId: result.log_id,
      sessionInfo: result.session_info,
    });

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
