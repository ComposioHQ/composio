import { Composio as ComposioClient } from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import {
  ToolRouterConfig,
  ToolRouterConfigSchema,
  ToolRouterSession,
} from '../types/toolRouter.types';
import { ValidationError } from '../errors';

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
   */
  async createSession(userId: string, routerConfig: ToolRouterConfig): Promise<ToolRouterSession> {
    const config = ToolRouterConfigSchema.safeParse(routerConfig);
    if (config.error) {
      throw new ValidationError('Failed to parse tool router config', {
        cause: config.error,
      });
    }

    // @TODO: Make request to the backend here
    return {
      sessionId: 'xxx',
      url: 'sss',
    };
  }
}
