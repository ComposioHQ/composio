import ComposioSDK from "@composio/client";
import { Tool } from "../types/tool.types";
import {
  ToolExecuteParams,
  ToolExecuteResponse,
  ToolGetInputParams,
  ToolGetInputResponse,
  ToolListParams,
  ToolListResponse,
  ToolRetrieveEnumResponse,
} from "@composio/client/resources/tools";
import { InstrumentedInstance } from "../types/telemetry.types";


/**
 * This class is used to manage tools in the Composio SDK.
 * It provides methods to list, get, and execute tools.
 */
export class Tools implements InstrumentedInstance {
  readonly FILE_NAME: string = "core/models/Tools.ts";
  private client: ComposioSDK;
  
  constructor(client: ComposioSDK) {
    this.client = client;
  }

  /**
   * Lists all tools available in the Composio SDK.
   * This method fetches the tools from the Composio API and wraps them using the toolset.
   * @returns {Tools[]>} List of tools
   */
  async list(query: ToolListParams = {}): Promise<ToolListResponse> {
      const tools = await this.client.tools.list(query);
      if (!tools) {
        return {
          items: [],
          next_cursor: null,
          total_pages: 0,
        };
      }
      return tools;
  }

  /**
   * Retrieves a tool by its Slug.
   * @param slug The ID of the tool to be retrieved
   * @returns {Promise<Tool>} The tool
   */
  async get(slug: string): Promise<Tool> {
    return this.client.tools.retrieve(slug);
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
