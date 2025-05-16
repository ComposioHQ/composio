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
import { ConnectionRequestTimeoutError } from '../errors/ConnectionRequestError';
export class ConnectionRequest {
  private client: ComposioClient;
  private connectedAccountId: string;
  private connectedAccountStatus: ConnectedAccountStatus;

  constructor(
    client: ComposioClient,
    connectedAccountId: string,
    connectedAccountStatus: ConnectedAccountStatus
  ) {
    this.client = client;
    this.connectedAccountId = connectedAccountId;
    this.connectedAccountStatus = connectedAccountStatus;
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
    if (this.connectedAccountStatus === ConnectedAccountStatuses.ACTIVE) {
      const response = await this.client.connectedAccounts.retrieve(this.connectedAccountId);
      return Promise.resolve(this.transformResponse(response));
    }

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const response = await this.client.connectedAccounts.retrieve(this.connectedAccountId);
          if (response.status === ConnectedAccountStatuses.ACTIVE) {
            clearInterval(interval);
            resolve(this.transformResponse(response));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(interval);
        reject(
          new ConnectionRequestTimeoutError(
            `Connection request timed out for ${this.connectedAccountId}`
          )
        );
      }, timeout);
    });
  }
}
