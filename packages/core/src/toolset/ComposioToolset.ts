import { Tool } from '../types/tool.types';
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
  readonly name = 'ComposioToolset';

  wrapTool = (tool: Tool): CustomTool => {
    return tool as CustomTool;
  };

  wrapTools(tools: Tool[]): CustomTool[] {
    return tools.map(tool => this.wrapTool(tool));
  }
}
