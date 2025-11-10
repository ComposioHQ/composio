import { Composio as ComposioClient } from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import {
  ToolRouterConfig,
  ToolRouterConfigSchema,
  ToolRouterSession,
  ToolRouterSessionSchema,
} from '../types/toolRouter.experimental.types';
import { ValidationError } from '../errors';
import { transform } from '../utils/transform';

export class ToolRouter {
  constructor(private client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'ToolRouter');
  }

  /**
   * Creates a new Session for the tool router
   *
   * @param userId {string} The user id to create the session for
   * @param routerConfig {ToolRouterConfig} The router config to use
   * @returns {Promise<ToolRouterSession>} The tool router session
   *
   * @example
   * ```typescript
   * import { Composio } form "@composio/core"
   *
   * const composio = new Composio()
   * const userId = "xxx-ooo-xxxx"
   *
   * const mcpSession = await composio.experimental.toolRouter.createSession(userId, {
   *  toolkits: ["github", "hackernews", "slack"]
   * })
   *
   * // with auth configs
   * const mcpSession = await composio.experimental.toolRouter.createSession(userId, {
   *  toolkits: [{ toolkit: "github", authConfingId: "ac_123455344"}]
   * ```
   */
  async createSession(userId: string, routerConfig?: ToolRouterConfig): Promise<ToolRouterSession> {
    const config = ToolRouterConfigSchema.safeParse(routerConfig ?? {});
    if (config.error) {
      throw new ValidationError('Failed to parse tool router config', {
        cause: config.error,
      });
    }

    const toolkitConfig = config.data.toolkits?.map(config => {
      if (typeof config === 'string') {
        return { toolkit: config };
      } else {
        return {
          toolkit: config.toolkit,
          auth_config_id: config.authConfigId,
        };
      }
    });

    const session = await this.client.toolRouter.createSession({
      user_id: userId,
      config: {
        toolkits: toolkitConfig,
        manually_manage_connections: config.data.manuallyManageConnections,
      },
    });

    return transform(session)
      .with(ToolRouterSessionSchema)
      .using(raw => ({
        sessionId: raw.session_id,
        url: raw.chat_session_mcp_url,
      }));
  }
}
