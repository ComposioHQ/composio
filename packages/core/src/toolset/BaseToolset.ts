import type { Toolset } from '../types/toolset.types';
import type { CustomAuthParams, Tool, ToolListParams } from '../types/tool.types';
import type { Composio } from '../composio';
import { ComposioError } from '../utils/error';

/**
 * Base toolset implementation with proper generic defaults
 * This class is used to create a different toolsets by extending this class.
 *
 * This class provides basic functionality to get tools, pre-process and post-process tools.
 * Every toolset should extend this class and implement the `_wrapTool` method,
 * these extended toolsets can add their own functionality/methods to the toolset.
 *
 * eg:
 * class YourToolSet extends BaseComposioToolset<CustomToolCollection, CustomTool> {}
 */
export abstract class BaseComposioToolset<TToolCollection, TTool>
  implements Toolset<TTool, TToolCollection>
{
  protected composio: Composio<this> | undefined;
  protected DEFAULT_ENTITY_ID = 'default';

  /**
   * Set the client for the toolset. This is automatically done by the Composio class.
   * @param client - The Composio client.
   */
  setComposio(composio: Composio<this>): void {
    this.composio = composio;
  }

  /**
   * Get all the tools from the client.
   * @param params - The parameters for the tool list.
   * @returns The tools.
   */
  abstract getTools(params?: ToolListParams): Promise<TToolCollection>;

  /**
   * Get a tool from the client.
   * @param slug - The slug of the tool.
   * @returns The tool.
   */
  async getToolBySlug(slug: string): Promise<TTool> {
    const tool = await this.getComposio().tools.getToolBySlug(slug);
    return this._wrapTool(tool);
  }

  /**
   * Wrap a tool in the toolset.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  abstract _wrapTool(tool: Tool): TTool;

  /**
   * Execute an action
   */
  async execute({
    toolSlug,
    params,
    entityId,
    connectedAccountId,
    text,
    customAuthParams,
  }: {
    toolSlug: string;
    params: Record<string, unknown>;
    entityId?: string;
    connectedAccountId?: string;
    text?: string;
    customAuthParams?: CustomAuthParams;
  }) {
    const tool = await this.getComposio()?.tools.getToolBySlug(toolSlug);

    if (!tool) {
      throw new ComposioError(`Tool with slug ${toolSlug} not found`);
    }

    try {
      const result = await this.getComposio().tools.execute(toolSlug, {
        arguments: params,
        userId: entityId,
        connectedAccountId: connectedAccountId,
        text: text,
        customAuthParams: customAuthParams,
      });
      return result;
    } catch (error) {
      throw new ComposioError(`Error executing tool ${toolSlug}: ${error}`);
    }
  }

  /**
   * Get the Composio client.
   * @returns The Composio client.
   */
  protected getComposio(): Composio<this> {
    if (!this.composio) {
      throw new Error(
        'Client not initialized. Make sure the toolset is properly initialized with Composio.'
      );
    }
    return this.composio;
  }
}
