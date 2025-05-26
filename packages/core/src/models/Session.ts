import ComposioClient from '@composio/client';
import { telemetry } from '../telemetry/Telemetry';
import { SessionRetrieveResponse } from '@composio/client/resources/auth/session';

export class Session {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this);
  }

  /**
   * Get the active session info
   * @returns {Promise<SessionInfoResponse>} Session info
   */
  async getInfo(): Promise<SessionRetrieveResponse> {
    return this.client.auth.session.retrieve();
  }
}
