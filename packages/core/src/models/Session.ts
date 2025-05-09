import { SessionGetInfoResponse } from '@composio/client/resources/auth/session';
import ComposioClient from '@composio/client';

export class Session {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
  }

  /**
   * Get the active session info
   * @returns {Promise<SessionGetInfoResponse>} Session info
   */
  async getInfo(): Promise<SessionGetInfoResponse> {
    return this.client.auth.session.getInfo();
  }
}
