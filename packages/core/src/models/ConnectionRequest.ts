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
  ConnectedAccountRetrieveResponseSchema,
} from '../types/connectedAccounts.types';
import { ConnectedAccountRetrieveResponse as OriginalConnectedAccountResponse } from '@composio/client/resources/connected-accounts';
import { ZodError } from 'zod';
import logger from '../utils/logger';
import {
  ConnectionRequestFailedError,
  ConnectionRequestTimeoutError,
} from '../errors/ConnectionRequestErrors';
import { ComposioConnectedAccountNotFoundError } from '../errors/ConnectedAccountsErrors';
import { telemetry } from '../telemetry/Telemetry';
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
   * Transforms the raw connected account response from the Composio API to the SDK format.
   *
   * This method converts property names from snake_case to camelCase and reorganizes
   * the data structure to match the SDK's standardized format.
   *
   * @param {OriginalConnectedAccountResponse} response - The raw API response to transform
   * @returns {Promise<ConnectedAccountRetrieveResponse>} The transformed response
   * @throws {ZodError} If the response fails validation against the expected schema
   *
   * @private
   */
  private async transformResponse(
    response: OriginalConnectedAccountResponse
  ): Promise<ConnectedAccountRetrieveResponse> {
    try {
      const parsedResponse = ConnectedAccountRetrieveResponseSchema.parse({
        ...response,
        userId: response.user_id, // Add the missing userId property
        authConfig: {
          ...response.auth_config,
          authScheme: response.auth_config.auth_scheme,
          isComposioManaged: response.auth_config.is_composio_managed,
          isDisabled: response.auth_config.is_disabled,
        },
        statusReason: response.status_reason,
        isDisabled: response.is_disabled,
        createdAt: response.created_at,
        updatedAt: response.updated_at,
        testRequestEndpoint: response.test_request_endpoint,
      });
      return parsedResponse;
    } catch (error) {
      logger.error('Error transforming response', error);
      if (error instanceof ZodError) {
        logger.error(JSON.stringify(error.errors, null, 2));
      }
      throw error;
    }
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
        return this.transformResponse(response);
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
          return this.transformResponse(response);
        }

        if (terminalErrorStates.includes(response.status)) {
          throw new ConnectionRequestFailedError(
            `Connection request failed with status: ${response.status}${response.status_reason ? `, reason: ${response.status_reason}` : ''}`,
            {
              meta: {
                userId: response.user_id,
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
