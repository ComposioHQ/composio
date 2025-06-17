import {
  ConnectedAccountListResponse as RawConnectedAccountListResponse,
  ConnectedAccountRetrieveResponse as RawConnectedAccountRetrieveResponse,
} from '@composio/client/resources/connected-accounts';
import {
  ConnectedAccountRetrieveResponse,
  ConnectedAccountRetrieveResponseSchema,
} from '../../types/connectedAccounts.types';
import { ValidationError } from '../../errors';

/**
 * Transforms the raw connected account response from the Composio API to the SDK format.
 *
 * This method converts property names from snake_case to camelCase and reorganizes
 * the data structure to match the SDK's standardized format.
 *
 * @param {RawConnectedAccountListResponse['items'][0]|RawConnectedAccountRetrieveResponse} response - The raw API response to transform
 * @returns {Promise<ConnectedAccountRetrieveResponse>} The transformed response
 * @throws {ZodError} If the response fails validation against the expected schema
 *
 * @private
 */
export function transformConnectedAccountResponse(
  response: RawConnectedAccountRetrieveResponse | RawConnectedAccountListResponse['items'][0]
): ConnectedAccountRetrieveResponse {
  const result = ConnectedAccountRetrieveResponseSchema.safeParse({
    ...response,
    authConfig: {
      ...response.auth_config,
      id: response.auth_config.id,
      isComposioManaged: response.auth_config.is_composio_managed,
      isDisabled: response.auth_config.is_disabled,
    },
    state: response.state,
    status: response.status,
    statusReason: response.status_reason,
    isDisabled: response.is_disabled,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    testRequestEndpoint: response.test_request_endpoint,
  });
  if (!result.success) {
    throw new ValidationError('Failed to parse connected account retrieve response', {
      cause: result.error,
    });
  }
  return result.data;
}
