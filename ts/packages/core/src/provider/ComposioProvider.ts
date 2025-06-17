import { McpServerGetResponse } from '../types/mcp.types';
import { Tool } from '../types/tool.types';
import { BaseMcpProvider, BaseNonAgenticProvider } from './BaseProvider';

/**
 * This is a default provider implementation for Composio.
 * This class is used as a default provider for Composio, if the user does not provide a provider.
 *
 * This class shouldn't be used directly or to be extended.
 */

interface CustomTool {
  name: string;
}
export class ComposioProvider extends BaseNonAgenticProvider<
  Array<CustomTool>,
  CustomTool,
  McpServerGetResponse
> {
  readonly name = 'ComposioProvider';

  readonly mcp = new BaseMcpProvider<McpServerGetResponse>();

  wrapTool = (tool: Tool): CustomTool => {
    return tool as CustomTool;
  };

  wrapTools(tools: Tool[]): CustomTool[] {
    return tools.map(tool => this.wrapTool(tool));
  }
}
