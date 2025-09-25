import { Composio as ComposioClient } from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import {
  ToolRouterConfig,
  ToolRouterConfigSchema,
  ToolRouterSession,
  ToolRouterSessionSchema,
} from '../types/toolRouter.types';
import { ValidationError } from '../errors';
import { transform } from '../utils/transform';

export class ToolRouter {
  constructor(private client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this);
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
   *  toolkits: [{
   *    toolkit: "slack",
   *    authConfigId: "ac_asdkasd"
   *    },
   *    {
   *      toolkit: "hackernews"
   *    },
   *    {
   *      toolkit: "github"
   *    }
   *  ],
   *  }]
   * })
   * ```
   */
  async createSession(userId: string, routerConfig: ToolRouterConfig): Promise<ToolRouterSession> {
    const config = ToolRouterConfigSchema.safeParse(routerConfig);
    if (config.error) {
      throw new ValidationError('Failed to parse tool router config', {
        cause: config.error,
      });
    }

    const session = await this.client.toolRouter.createSession({
      user_id: userId,
      config: {
        toolkits: config.data.toolkits?.map(toolkit => ({
          toolkit: toolkit.toolkit,
          auth_config: toolkit.authConfigId,
        })),
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
