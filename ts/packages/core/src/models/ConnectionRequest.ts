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
 * @returns {ConnectionRequestState & { waitForConnection: (timeout?: number) => Promise<ConnectedAccountRetrieveResponse> }}
 * Connection request object with state and methods
 */
export function createConnectionRequest(
  client: ComposioClient,
  connectedAccountId: string,
  status?: ConnectedAccountStatus,
  redirectUrl?: string | null
): ConnectionRequest {
  const state: ConnectionRequestState = {
    id: connectedAccountId,
    status: status || ConnectedAccountStatuses.INITIATED,
    redirectUrl,
  };

  telemetry.instrument(state, 'ConnectionRequest');

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
    try {
      const response = await client.connectedAccounts.retrieve(state.id);
      if (response.status === ConnectedAccountStatuses.ACTIVE) {
        state.status = ConnectedAccountStatuses.ACTIVE;
        return transformConnectedAccountResponse(response);
      }
    } catch (error) {
      if (error instanceof ComposioClient.NotFoundError) {
        throw new ComposioConnectedAccountNotFoundError(
          `Connected account with id ${state.id} not found`,
          {
            meta: {
              connectedAccountId: state.id,
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
        const response = await client.connectedAccounts.retrieve(state.id);

        state.status = response.status;
        if (response.status === ConnectedAccountStatuses.ACTIVE) {
          return transformConnectedAccountResponse(response);
        }

        if (terminalErrorStates.includes(response.status)) {
          throw new ConnectionRequestFailedError(
            `Connection request failed with status: ${response.status}${response.status_reason ? `, reason: ${response.status_reason}` : ''}`,
            {
              meta: {
                connectedAccountId: state.id,
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

    throw new ConnectionRequestTimeoutError(`Connection request timed out for ${state.id}`);
  }

  return {
    ...state,
    waitForConnection,
    toJSON: () => ({ ...state }),
    toString: () => JSON.stringify(state, null, 2),
  };
}
