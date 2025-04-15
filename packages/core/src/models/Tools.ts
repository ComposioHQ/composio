import ComposioSDK from "@composio/client";
import { Tool } from "../types/tool.types";
import { Toolset, WrappedTool } from "../types/toolset.types.";
import {
  ToolExecuteParams,
  ToolExecuteResponse,
  ToolGetInputParams,
  ToolGetInputResponse,
  ToolListParams,
  ToolRetrieveEnumResponse,
} from "@composio/client/resources/tools";

/**
 * This class is used to manage tools in the Composio SDK.
 * It provides methods to list, get, and execute tools.
 * It also provides a method to wrap tools using the toolset.
 */
export class Tools<TTool extends Tool, TToolset extends Toolset<TTool>> {
  private client: ComposioSDK;
  private toolset: TToolset;

  constructor(client: ComposioSDK, toolset: TToolset) {
    this.client = client;
    this.toolset = toolset;
  }

  /**
   * This method helps us to safely wrap the tool in the toolset.
   *
   * @param {Tool} tool Tool to be wrapped by the toolset
   * @returns {ReturnType<WrappedTool<TToolset>>} Wrapped tool
   */
  private wrap(tool: Tool): WrappedTool<TToolset> {
    return this.toolset._wrapTool(tool) as WrappedTool<TToolset>;
  }

  /**
   * Lists all tools available in the Composio SDK.
   * This method fetches the tools from the Composio API and wraps them using the toolset.
   * @returns {Promise<WrappedTool<TToolset>[]>} List of tools
   */
  async list(query: ToolListParams = {}): Promise<WrappedTool<TToolset>[]> {
    try {
      const tools = await this.client.tools.list(query);
      if (!tools) {
        return [];
      }
      return tools.items.map((tool) => this.wrap(tool));
    } catch (error) {
      console.error("Error fetching tools:", error);
      return [];
    }
  }

  /**
   * Retrieves a tool by its Slug.
   * @param slug The ID of the tool to be retrieved
   * @returns {Promise<WrappedTool<TToolset>>} The tool object wrapped by the toolset
   */
  async get(slug: string): Promise<WrappedTool<TToolset>> {
    const tool = await this.client.tools.retrieve(slug);
    return this.wrap(tool);
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
    body: ToolExecuteParams
  ): Promise<ToolExecuteResponse> {
    return this.client.tools.execute(slug, body);
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
  async getInput(
    slug: string,
    body: ToolGetInputParams
  ): Promise<ToolGetInputResponse> {
    return this.client.tools.getInput(slug, body);
  }
}
