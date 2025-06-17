import { McpServerGetResponse, McpUrlResponse } from '../types/mcp.types';
import { Tool } from '../types/tool.types';
import { McpProvider, BaseNonAgenticProvider } from './BaseProvider';

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

  readonly mcp = new McpProvider<McpServerGetResponse>();

  wrapTool = (tool: Tool): CustomTool => {
    return tool as CustomTool;
  };

  wrapTools(tools: Tool[]): CustomTool[] {
    return tools.map(tool => this.wrapTool(tool));
  }

  transformMcpResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): McpServerGetResponse {
    if (connectedAccountIds?.length && data.connected_account_urls) {
      return data.connected_account_urls.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${connectedAccountIds[index]}`,
        toolkit: toolkits?.[index],
      })) as McpServerGetResponse;
    } else if (userIds?.length && data.user_ids_url) {
      return data.user_ids_url.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${userIds[index]}`,
        toolkit: toolkits?.[index],
      })) as McpServerGetResponse;
    }
    return {
      url: new URL(data.mcp_url),
      name: serverName,
    } as McpServerGetResponse;
  }
}
