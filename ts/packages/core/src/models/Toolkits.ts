import ComposioClient from '@composio/client';
import {
  ToolkitListParams,
  ToolKitListResponse,
  ToolkitRetrieveResponse,
  ToolkitsListParamsSchema,
  ToolkitRetrieveCategoriesResponse,
  ToolkitAuthFieldsResponse,
} from '../types/toolkit.types';
import { ComposioToolkitFetchError, ComposioToolkitNotFoundError } from '../errors';
import { ValidationError } from '../errors/ValidationErrors';
import { AuthConfigs } from './AuthConfigs';
import { ComposioAuthConfigNotFoundError } from '../errors/AuthConfigErrors';
import { ConnectedAccounts } from './ConnectedAccounts';
import { ConnectionRequest } from '../types/connectionRequest.types';
import { telemetry } from '../telemetry/Telemetry';
import { AuthSchemeType } from '../types/authConfigs.types';
import logger from '../utils/logger';
import { APIError } from 'openai';
import {
  transformToolkitListResponse,
  transformToolkitRetrieveCategoriesResponse,
  transformToolkitRetrieveResponse,
} from '../utils/transformers/toolkits';
/**
 * Toolkits class
 *
 * Toolkits are a collection of tools that can be used to perform various tasks.
 * This is similar/replacement of `apps` in the Composio API.
 */
export class Toolkits {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    this.authorize = this.authorize.bind(this);
    telemetry.instrument(this, 'Toolkits');
  }
  /**
   * Retrieves a list of toolkits based on the provided query parameters.
   *
   * This method fetches toolkits from the Composio API and transforms the response
   * from snake_case to camelCase format for consistency with JavaScript/TypeScript conventions.
   *
   * @param {ToolkitListParams} query - The query parameters to filter toolkits
   * @returns {Promise<ToolKitListResponse>} The transformed list of toolkits
   *
   * @private
   */
  private async getToolkits(query: ToolkitListParams): Promise<ToolKitListResponse> {
    try {
      const parsedQuery = ToolkitsListParamsSchema.safeParse(query);
      if (!parsedQuery.success) {
        throw new ValidationError('Failed to parse toolkit list query', {
          cause: parsedQuery.error,
        });
      }
      const result = await this.client.toolkits.list({
        category: parsedQuery.data.category,
        managed_by: parsedQuery.data.managedBy,
        sort_by: parsedQuery.data.sortBy,
        cursor: parsedQuery.data.cursor,
        limit: parsedQuery.data.limit,
      });

      return transformToolkitListResponse(result);
    } catch (error) {
      throw new ComposioToolkitFetchError('Failed to fetch toolkits', {
        cause: error,
      });
    }
  }
  /**
   * Retrieves a specific toolkit by its slug identifier.
   *
   * This method fetches a single toolkit from the Composio API and transforms
   * the response to use camelCase property naming consistent with JavaScript/TypeScript conventions.
   *
   * @param {string} slug - The unique slug identifier of the toolkit to retrieve
   * @returns {Promise<ToolkitRetrieveResponse>} The transformed toolkit object
   * @throws {ValidationError} If the response cannot be properly parsed
   * @throws {ComposioToolNotFoundError} If no toolkit with the given slug exists
   *
   * @private
   */
  protected async getToolkitBySlug(slug: string): Promise<ToolkitRetrieveResponse> {
    try {
      const result = await this.client.toolkits.retrieve(slug);
      return transformToolkitRetrieveResponse(result);
    } catch (error) {
      if (error instanceof APIError && (error.status === 404 || error.status === 400)) {
        throw new ComposioToolkitNotFoundError(`Toolkit with slug ${slug} not found`, {
          meta: {
            slug,
          },
          cause: error,
        });
      }
      throw new ComposioToolkitFetchError(`Couldn't fetch Toolkit with slug: ${slug}`, {
        meta: {
          slug,
        },
        cause: error,
      });
    }
  }

  /**
   * Retrieves a specific toolkit by its slug identifier.
   *
   * @param {string} slug - The unique slug identifier of the toolkit to retrieve
   * @returns {Promise<ToolkitRetrieveResponse>} The toolkit object with detailed information
   * @throws {ComposioToolNotFoundError} If no toolkit with the given slug exists
   *
   * @example
   * ```typescript
   * // Get a specific toolkit
   * const githubToolkit = await composio.toolkits.get('github');
   * console.log(githubToolkit.name); // GitHub
   * console.log(githubToolkit.authConfigDetails); // Authentication configuration details
   * ```
   */
  async get(slug: string): Promise<ToolkitRetrieveResponse>;

  /**
   * Retrieves a list of toolkits based on the provided query parameters.
   *
   * @param {ToolkitListParams} query - The query parameters to filter toolkits
   * @returns {Promise<ToolKitListResponse>} A paginated list of toolkits matching the query criteria
   *
   * @example
   * ```typescript
   * // Get all toolkits
   * const allToolkits = await composio.toolkits.get({});
   *
   * // Get toolkits by category
   * const devToolkits = await composio.toolkits.get({
   *   category: 'developer-tools'
   * });
   *
   * // Get local toolkits
   * const localToolkits = await composio.toolkits.get({
   *   isLocal: true
   * });
   * ```
   */
  async get(query?: ToolkitListParams): Promise<ToolKitListResponse>;

  /**
   * Implementation method that handles both overloads for retrieving toolkits.
   *
   * @param {string | ToolkitListParams} arg - Either a toolkit slug or query parameters
   * @returns {Promise<ToolkitRetrieveResponse | ToolKitListResponse>} The toolkit or list of toolkits
   */
  async get(
    arg?: string | ToolkitListParams
  ): Promise<ToolkitRetrieveResponse | ToolKitListResponse> {
    if (typeof arg === 'string') {
      return this.getToolkitBySlug(arg);
    }
    return this.getToolkits(arg ?? {});
  }

  private async getAuthConfigFields(
    toolkitSlug: string,
    authScheme: AuthSchemeType | null,
    authConfigType: 'authConfigCreation' | 'connectedAccountInitiation',
    requiredOnly: boolean
  ): Promise<ToolkitAuthFieldsResponse> {
    const toolkit = await this.getToolkitBySlug(toolkitSlug);
    if (!toolkit.authConfigDetails) {
      throw new ComposioAuthConfigNotFoundError('No auth config found for toolkit', {
        meta: {
          toolkitSlug,
        },
      });
    }

    // if multiple auth configs are found, warn the user and select the first one
    if (toolkit.authConfigDetails.length > 1 && !authScheme) {
      logger.warn(
        `Multiple auth configs found for ${toolkitSlug}, please specify the auth scheme to get details of specific auth scheme. Selecting the first scheme by default.`,
        {
          meta: {
            toolkitSlug,
          },
        }
      );
    }

    // if authScheme is provided, find the auth config for the given auth scheme
    // otherwise, use the first auth config
    const authConfig = authScheme
      ? toolkit.authConfigDetails.find(authConfig => authConfig.mode === authScheme)
      : toolkit.authConfigDetails[0];

    if (!authConfig) {
      throw new ComposioAuthConfigNotFoundError(
        `Auth schema ${authScheme} not found for toolkit ${toolkitSlug} with auth scheme ${authScheme}`,
        {
          meta: {
            toolkitSlug,
            authScheme,
          },
        }
      );
    }

    const requiredFields = authConfig.fields[authConfigType].required.map(field => ({
      ...field,
      required: true,
    }));
    if (requiredOnly) {
      return requiredFields;
    }

    const optionalFields = authConfig.fields[authConfigType].optional.map(field => ({
      ...field,
      required: false,
    }));

    return [...requiredFields, ...optionalFields];
  }

  /**
   * Retrieves the fields required for creating an auth config for a toolkit.
   * @param toolkitSlug - The slug of the toolkit to retrieve the fields for
   * @param authScheme - The auth scheme to retrieve the fields for
   * @param options.requiredOnly - Whether to only return the required fields
   * @returns {Promise<ToolkitAuthFieldsResponse>} The fields required for creating an auth config
   */
  async getAuthConfigCreationFields(
    toolkitSlug: string,
    authScheme: AuthSchemeType,
    { requiredOnly = false }: { requiredOnly?: boolean } = {}
  ): Promise<ToolkitAuthFieldsResponse> {
    return this.getAuthConfigFields(
      toolkitSlug,
      authScheme ?? null,
      'authConfigCreation',
      requiredOnly
    );
  }

  /**
   * Retrieves the fields required for initiating a connected account for a toolkit.
   * @param toolkitSlug - The slug of the toolkit to retrieve the fields for
   * @param authScheme - The auth scheme to retrieve the fields for
   * @param options.requiredOnly - Whether to only return the required fields
   * @returns {Promise<ToolkitAuthFieldsResponse>} The fields required for initiating a connected account
   */
  async getConnectedAccountInitiationFields(
    toolkitSlug: string,
    authScheme: AuthSchemeType,
    { requiredOnly = false }: { requiredOnly?: boolean } = {}
  ): Promise<ToolkitAuthFieldsResponse> {
    return this.getAuthConfigFields(
      toolkitSlug,
      authScheme ?? null,
      'connectedAccountInitiation',
      requiredOnly
    );
  }

  /**
   * Retrieves all toolkit categories available in the Composio SDK.
   *
   * This method fetches the complete list of categories from the Composio API
   * and transforms the response to use camelCase property naming.
   *
   * @returns {Promise<ToolkitRetrieveCategoriesResponse>} The list of toolkit categories
   *
   * @example
   * ```typescript
   * // Get all toolkit categories
   * const categories = await composio.toolkits.listCategories();
   * console.log(categories.items); // Array of category objects
   * ```
   */
  async listCategories(): Promise<ToolkitRetrieveCategoriesResponse> {
    const result = await this.client.toolkits.retrieveCategories();
    return transformToolkitRetrieveCategoriesResponse(result);
  }

  /**
   * Authorizes a user to use a toolkit.
   * This method will create an auth config if one doesn't exist and initiate a connection request.
   * @param {string} userId - The user id of the user to authorize
   * @param {string} toolkitSlug - The slug of the toolkit to authorize
   * @returns {Promise<ConnectionRequest>} The connection request object
   *
   * @example
   * ```typescript
   * const connectionRequest = await composio.toolkits.authorize(userId, 'github');
   * ```
   *
   */
  async authorize(
    userId: string,
    toolkitSlug: string,
    authConfigId?: string
  ): Promise<ConnectionRequest> {
    const toolkit = await this.getToolkitBySlug(toolkitSlug);
    const composioAuthConfig = new AuthConfigs(this.client);
    let authConfigIdToUse: string | undefined = authConfigId;

    if (!authConfigIdToUse) {
      const authConfig = await composioAuthConfig.list({
        toolkit: toolkitSlug,
      });
      // pick the first auth config if none is passed
      authConfigIdToUse = authConfig.items[0]?.id;
    }

    // if no auth config is found, create one for the toolkit
    if (!authConfigIdToUse) {
      // create authConfig using composioManagedAuthSchemes
      if (toolkit.authConfigDetails && toolkit.authConfigDetails.length > 0) {
        try {
          const authConfig = await composioAuthConfig.create(toolkitSlug, {
            type: 'use_composio_managed_auth',
            name: `${toolkit.name} Auth Config`,
          });
          authConfigIdToUse = authConfig.id;
        } catch (error) {
          if (error instanceof ComposioClient.APIError && error.status === 400) {
            throw new ComposioAuthConfigNotFoundError(
              `No Default auth config found for toolkit ${toolkitSlug}`,
              {
                meta: {
                  toolkitSlug,
                },
                cause: error,
                possibleFixes: [
                  `Please Create an auth config for the toolkit ${toolkitSlug} via the dashboard`,
                ],
              }
            );
          }
          throw error;
        }
      } else {
        throw new ComposioAuthConfigNotFoundError(
          `No auth configs found for toolkit ${toolkitSlug}`,
          {
            meta: {
              toolkitSlug,
            },
          }
        );
      }
    }
    // create the auth config
    const composioConnectedAccount = new ConnectedAccounts(this.client);
    return await composioConnectedAccount.initiate(userId, authConfigIdToUse, {
      // in this magic function we allow multiple connected accounts per user for an auth config
      allowMultiple: true,
    });
  }
}
