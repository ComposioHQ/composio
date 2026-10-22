/**
 * @fileoverview Connection request function for Composio SDK, used to manage an initiated connection request.
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
import { ConnectionRequest, ConnectionRequestState } from '../types/connectionRequest.types';

/**
 * Creates a connection request object with methods to manage the connection lifecycle.
 *
 * @param {ComposioClient} client - The Composio client instance
 * @param {string} connectedAccountId - The ID of the connected account
 * @param {ConnectedAccountStatus} [status] - Initial status of the connection
 * @param {string | null} [redirectUrl] - OAuth redirect URL if applicable
 * @returns {ConnectionRequest} Connection request object with state and methods
 */
export function createConnectionRequest(
  client: ComposioClient,
  connectedAccountId: string,
  status?: ConnectedAccountStatus,
  redirectUrl?: string | null
): ConnectionRequest {
  // `waitForConnection` records each observed status on this same object, so
  // `request.status` and `toJSON()` never disagree.
  const request: ConnectionRequest = {
    id: connectedAccountId,
    status: status || ConnectedAccountStatuses.INITIATED,
    redirectUrl,
    waitForConnection,
    toJSON: (): ConnectionRequestState => ({
      id: request.id,
      status: request.status,
      redirectUrl: request.redirectUrl,
    }),
    toString: () => JSON.stringify(request.toJSON(), null, 2),
  };

  telemetry.instrument(request, 'ConnectionRequest');

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
  async function waitForConnection(
    timeout: number = 60000
  ): Promise<ConnectedAccountRetrieveResponse> {
    const terminalErrorStates: ConnectedAccountStatus[] = [
      ConnectedAccountStatuses.FAILED,
      ConnectedAccountStatuses.EXPIRED,
      ConnectedAccountStatuses.REVOKED,
    ];
    const failIfTerminal = (response: {
      status: ConnectedAccountStatus;
      status_reason?: string | null;
    }) => {
      if (terminalErrorStates.includes(response.status)) {
        throw new ConnectionRequestFailedError(
          `Connection request failed with status: ${response.status}${response.status_reason ? `, reason: ${response.status_reason}` : ''}`,
          {
            meta: {
              connectedAccountId: request.id,
              status: response.status,
              statusReason: response.status_reason,
            },
          }
        );
      }
    };

    try {
      const response = await client.connectedAccounts.retrieve(request.id);
      request.status = response.status;
      if (response.status === ConnectedAccountStatuses.ACTIVE) {
        return transformConnectedAccountResponse(response);
      }
      failIfTerminal(response);
    } catch (error) {
      if (error instanceof ComposioClient.NotFoundError) {
        throw new ComposioConnectedAccountNotFoundError(
          `Connected account with id ${request.id} not found`,
          {
            meta: {
              connectedAccountId: request.id,
            },
          }
        );
      } else {
        throw error;
      }
    }

    const start = Date.now();
    const pollInterval = 1000;

    while (Date.now() - start < timeout) {
      try {
        const response = await client.connectedAccounts.retrieve(request.id);

        request.status = response.status;
        if (response.status === ConnectedAccountStatuses.ACTIVE) {
          return transformConnectedAccountResponse(response);
        }

        failIfTerminal(response);

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        throw error;
      }
    }

    throw new ConnectionRequestTimeoutError(`Connection request timed out for ${request.id}`);
  }

  return request;
}
