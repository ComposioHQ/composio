import { ToolOptions } from '../types/modifiers.types';
import { Tool, ToolListParams } from '../types/tool.types';
import { BaseNonAgenticToolset } from './BaseToolset';

/**
 * This is a default toolset implementation for Composio.
 * This class is used as a default toolset for Composio, if the user does not provide a toolset.
 *
 * This class shouldn't be used directly or to be extended.
 */

interface CustomTool {
  name: string;
}
export class ComposioToolset extends BaseNonAgenticToolset<Array<CustomTool>, CustomTool> {
  readonly FILE_NAME: string = 'core/toolset/ComposioToolset.ts';

  constructor() {
    super();
  }

  wrapTool = (tool: Tool): CustomTool => {
    return tool as CustomTool;
  };

  async getTools(
    userId: string,
    params?: ToolListParams,
    options?: ToolOptions
  ): Promise<Array<CustomTool>> {
    const tools = await this.getComposio().tools.getComposioTools(
      userId,
      params,
      options?.modifyToolSchema
    );
    return tools?.map(tool => this.wrapTool(tool)) ?? [];
  }

  async getToolBySlug(userId: string, slug: string, modifiers?: ToolOptions): Promise<CustomTool> {
    const tool = await this.getComposio().tools.getComposioToolBySlug(
      userId,
      slug,
      modifiers?.modifyToolSchema
    );
    return this.wrapTool(tool);
  }

  async test() {}
}
