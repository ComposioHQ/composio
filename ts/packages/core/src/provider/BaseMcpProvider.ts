import ComposioClient from '@composio/client';
import { McpProvider } from './McpProvider';
import { McpUrlResponse } from '../types/mcp.types';

export class BaseMcpProvider<T> extends McpProvider<T> {
  setup(client: ComposioClient): void {
    this.client = client;
  }

  protected transformGetResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[],
    toolkits?: string[]
  ): T {
    if (connectedAccountIds?.length && data.connected_account_urls) {
      return data.connected_account_urls.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${connectedAccountIds[index]}`,
        toolkit: toolkits?.[index],
      })) as T;
    } else if (userIds?.length && data.user_ids_url) {
      return data.user_ids_url.map((url: string, index: number) => ({
        url: new URL(url),
        name: `${serverName}-${userIds[index]}`,
        toolkit: toolkits?.[index],
      })) as T;
    }
    return {
      url: new URL(data.mcp_url),
      name: serverName,
    } as T;
  }
}
