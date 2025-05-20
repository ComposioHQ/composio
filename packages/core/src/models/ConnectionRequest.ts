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
} from '../errors/ConnectionRequestError';
export class ConnectionRequest {
  private client: ComposioClient;
  public id: string;
  public status: ConnectedAccountStatus;
  public redirectUrl?: string | null;

  constructor(
    client: ComposioClient,
    connectedAccountId: string,
    connectedAccountStatus: ConnectedAccountStatus,
    redirectUrl?: string | null
  ) {
    this.client = client;
    this.id = connectedAccountId;
    this.status = connectedAccountStatus;
    this.redirectUrl = redirectUrl;
  }

  /**
   * Transform the response from the Composio API to the SDK format
   * @param response
   * @returns
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
   * Wait for the connection to be established.
   * The function will poll the Composio API every second until the connection is established or the timeout is reached.
   * @param {number} timeout - The time in milliseconds to wait for the connection to be established. Default is 30 seconds.
   * @returns
   */
  async waitForConnection(timeout: number = 60000): Promise<ConnectedAccountRetrieveResponse> {
    if (this.status === ConnectedAccountStatuses.ACTIVE) {
      const response = await this.client.connectedAccounts.retrieve(this.id);
      return this.transformResponse(response);
    }

    const terminalErrorStates: ConnectedAccountStatus[] = [
      ConnectedAccountStatuses.FAILED,
      ConnectedAccountStatuses.EXPIRED,
      ConnectedAccountStatuses.DELETED,
    ];

    const start = Date.now();
    const pollInterval = 1000;

    while (Date.now() - start < timeout) {
      try {
        const response = await this.client.connectedAccounts.retrieve(this.id);

        if (response.status === ConnectedAccountStatuses.ACTIVE) {
          return this.transformResponse(response);
        }

        if (terminalErrorStates.includes(response.status)) {
          throw new ConnectionRequestFailedError(
            `Connection request failed with status: ${response.status}${response.status_reason ? `, reason: ${response.status_reason}` : ''}`,
            {
              userId: response.user_id,
              connectedAccountId: this.id,
              status: response.status,
              statusReason: response.status_reason,
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
}
