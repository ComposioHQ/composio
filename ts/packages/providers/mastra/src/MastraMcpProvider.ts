/**
 * Mastra MCP Provider
 *
 * This provider extends the McpProvider for Mastra.ai specific functionality
 *
 * @packageDocumentation
 * @module providers/mastra/MastraMcpProvider
 */
import { McpProvider } from '@composio/core';
import type { McpUrlResponse } from '@composio/core';

export interface MastraUrlMap {
  [name: string]: { url: URL };
}

export class MastraMcpProvider extends McpProvider<MastraUrlMap> {
  readonly name = 'mastra';

  protected transformGetResponse(
    data: McpUrlResponse,
    serverName: string,
    connectedAccountIds?: string[],
    userIds?: string[]
  ): MastraUrlMap {
    if (connectedAccountIds?.length && data.connected_account_urls) {
      return data.connected_account_urls.reduce(
        (prev: MastraUrlMap, url: string, index: number) => {
          prev[`${serverName}-${index}`] = {
            url: new URL(url),
          };
          return prev;
        },
        {}
      );
    } else if (userIds?.length && data.user_ids_url) {
      return data.user_ids_url.reduce((prev: MastraUrlMap, url: string, index: number) => {
        prev[`${serverName}-${index}`] = {
          url: new URL(url),
        };
        return prev;
      }, {});
    }
    return {
      [serverName]: {
        url: new URL(data.mcp_url),
      },
    };
  }
}
