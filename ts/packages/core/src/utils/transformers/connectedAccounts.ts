import {
  ConnectedAccountListResponse as RawConnectedAccountListResponse,
  ConnectedAccountRetrieveResponse as RawConnectedAccountRetrieveResponse,
} from '@composio/client/resources/connected-accounts';
import {
  ConnectedAccountListResponse,
  ConnectedAccountListResponseSchema,
  ConnectedAccountRetrieveResponse,
  ConnectedAccountRetrieveResponseSchema,
} from '../../types/connectedAccounts.types';
import { ConnectionDataSchema } from '../../types/connectedAccountAuthStates.types';
import logger from '../logger';
import { transform } from '../transform';

type RawConnectedAccountResponseWithLabels = (
  | RawConnectedAccountRetrieveResponse
  | RawConnectedAccountListResponse['items'][0]
) & {
  word_id?: string | null;
  alias?: string | null;
};

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
  const responseWithLabels = response as RawConnectedAccountResponseWithLabels;

  // Safely parse the state field, filtering out unsupported auth schemes
  const parseState = (state: unknown) => {
    try {
      return state ? ConnectionDataSchema.parse(state) : undefined;
    } catch (error) {
      logger.warn('Unsupported auth scheme in connected account state, ignoring state field', {
        error,
      });
      return undefined;
    }
  };

  return transform(response)
    .with(ConnectedAccountRetrieveResponseSchema)
    .using(response => ({
      ...response,
      authConfig: {
        ...response.auth_config,
        id: response.auth_config.id,
        authScheme: response.auth_config.auth_scheme,
        isComposioManaged: response.auth_config.is_composio_managed,
        isDisabled: response.auth_config.is_disabled,
      },
      wordId: responseWithLabels.word_id ?? null,
      alias: responseWithLabels.alias ?? null,
      data: (response as unknown as ConnectedAccountRetrieveResponse).data ?? undefined,
      state: parseState(response.state),
      status: response.status,
      statusReason: response.status_reason,
      isDisabled: response.is_disabled,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
      testRequestEndpoint: response.test_request_endpoint,
    }));
}

/**
 * Transforms the raw connected account list response from the Composio API to the SDK format.
 *
 * This method converts property names from snake_case to camelCase and reorganizes
 * the data structure to match the SDK's standardized format.
 *
 * @param {RawConnectedAccountListResponse} response - The raw API response to transform
 * @returns {ConnectedAccountListResponse} The transformed response
 * @throws {ZodError} If the response fails validation against the expected schema
 *
 * @private
 */
export function transformConnectedAccountListResponse(
  response: RawConnectedAccountListResponse
): ConnectedAccountListResponse {
  return transform(response)
    .with(ConnectedAccountListResponseSchema)
    .using(response => ({
      items: response.items.map(transformConnectedAccountResponse),
      nextCursor: response.next_cursor ?? null,
      totalPages: response.total_pages,
    }));
}
