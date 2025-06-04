/**
 * @fileoverview Connection request class for Composio SDK, used to manage an initiated connection request.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module ConnectionRequest
 */
import ComposioClient from '@composio/client';
import {
  ConnectedAccountStatus,
  ConnectedAccountStatuses,
  ConnectedAccountRetrieveResponse,
} from '../types/connectedAccounts.types';
import {
  ConnectionRequestFailedError,
  ConnectionRequestTimeoutError,
} from '../errors/ConnectionRequestErrors';
import { ComposioConnectedAccountNotFoundError } from '../errors/ConnectedAccountsErrors';
import { telemetry } from '../telemetry/Telemetry';
import { transformConnectedAccountResponse } from '../utils/transformers/connectedAccounts';
export class ConnectionRequest {
  private client: ComposioClient;
  public id: string;
  public status?: ConnectedAccountStatus;
  public redirectUrl?: string | null;

  constructor(
    client: ComposioClient,
    connectedAccountId: string,
    status?: ConnectedAccountStatus,
    redirectUrl?: string | null
  ) {
    this.client = client;
    this.id = connectedAccountId;
    this.status = status || ConnectedAccountStatuses.INITIATED;
    this.redirectUrl = redirectUrl;
    telemetry.instrument(this);
  }

  /**
   * Waits for the connection request to complete and become active.
   *
   * This method continuously polls the Composio API to check the status of the connection request
   * until it either becomes active, enters a terminal error state, or times out.
   *
   * @param {number} [timeout=60000] - Maximum time to wait in milliseconds before timing out (default: 60 seconds)
   * @returns {Promise<ConnectedAccountRetrieveResponse>} The final connected account response when successful
   * @throws {ComposioConnectedAccountNotFoundError} If the connected account cannot be found
   * @throws {ConnectionRequestFailedError} If the connection enters a failed, expired, or deleted state
   * @throws {ConnectionRequestTimeoutError} If the connection request does not complete within the timeout period
   *
   * @example
   * ```typescript
   * // Wait for connection with default timeout (60 seconds)
   * try {
   *   const connection = await connectionRequest.waitForConnection();
   *   console.log('Connection established:', connection.id);
   * } catch (error) {
   *   console.error('Connection failed:', error.message);
   * }
   *
   * // Wait for connection with custom timeout (2 minutes)
   * const connection = await connectionRequest.waitForConnection(120000);
   * ```
   */
  async waitForConnection(timeout: number = 60000): Promise<ConnectedAccountRetrieveResponse> {
    try {
      const response = await this.client.connectedAccounts.retrieve(this.id);
      if (response.status === ConnectedAccountStatuses.ACTIVE) {
        this.status = ConnectedAccountStatuses.ACTIVE;
        return transformConnectedAccountResponse(response);
      }
    } catch (error) {
      if (error instanceof ComposioClient.NotFoundError) {
        throw new ComposioConnectedAccountNotFoundError(
          `Connected account with id ${this.id} not found`,
          {
            meta: {
              connectedAccountId: this.id,
            },
          }
        );
      } else {
        throw error;
      }
    }

    const terminalErrorStates: ConnectedAccountStatus[] = [
      ConnectedAccountStatuses.FAILED,
      ConnectedAccountStatuses.EXPIRED,
    ];

    const start = Date.now();
    const pollInterval = 1000;

    while (Date.now() - start < timeout) {
      try {
        const response = await this.client.connectedAccounts.retrieve(this.id);

        this.status = response.status;
        if (response.status === ConnectedAccountStatuses.ACTIVE) {
          return transformConnectedAccountResponse(response);
        }

        if (terminalErrorStates.includes(response.status)) {
          throw new ConnectionRequestFailedError(
            `Connection request failed with status: ${response.status}${response.status_reason ? `, reason: ${response.status_reason}` : ''}`,
            {
              meta: {
                connectedAccountId: this.id,
                status: response.status,
                statusReason: response.status_reason,
              },
            }
          );
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        throw error;
      }
    }

    throw new ConnectionRequestTimeoutError(`Connection request timed out for ${this.id}`);
  }

  /**
   * Returns a JSON-serializable representation of the connection request
   * Excludes the private client property to avoid cyclic reference issues
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      status: this.status,
      redirectUrl: this.redirectUrl,
    };
  }

  /**
   * Returns a string representation of the connection request
   */
  toString(): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

export const connectionRequest = (client: ComposioClient) => {
  return {
    waitForConnection: async (connectedAccountId: string, timeout: number = 60000) => {
      return new ConnectionRequest(
        client,
        connectedAccountId,
        ConnectedAccountStatuses.INITIATED
      ).waitForConnection(timeout);
    },
  };
};
