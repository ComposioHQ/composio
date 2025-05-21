import ComposioClient from '@composio/client';
import {
  ToolKitItemSchema,
  ToolkitListParams,
  ToolKitListResponse,
  ToolKitListResponseSchema,
  ToolkitRetrieveResponse,
  ToolkitRetrieveResponseSchema,
  ToolkitsListParamsSchema,
  ToolkitRetrieveCategoriesResponse,
  ToolkitRetrieveCategoriesResponseSchema,
  ToolkitCategorySchema,
} from '../types/toolkit.types';
import { ComposioToolNotFoundError } from '../errors/ToolErrors';
import { ZodError } from 'zod';
import { ValidationError } from '../errors/ValidationError';
import { AuthConfigs } from './AuthConfigs';
import { ComposioAuthConfigNotFoundError } from '../errors/AuthConfigErrors';
import { ConnectedAccounts } from './ConnectedAccounts';
import { ConnectionRequest } from './ConnectionRequest';
import { telemetry } from '../telemetry/Telemetry';
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
    telemetry.instrument(this);
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
    const parsedQuery = ToolkitsListParamsSchema.parse(query);
    const result = await this.client.toolkits.list({
      category: parsedQuery.category,
      is_local: parsedQuery.isLocal,
      managed_by: parsedQuery.managedBy,
      sort_by: parsedQuery.sortBy,
    });

    const parsedResult = ToolKitListResponseSchema.parse({
      items: result.items.map(item => {
        const parsedItem = ToolKitItemSchema.parse({
          name: item.name,
          slug: item.slug,
          meta: item.meta,
          isLocalToolkit: item.is_local_toolkit,
          authSchemes: item.auth_schemes,
          composioManagedAuthSchemes: item.composio_managed_auth_schemes,
          noAuth: item.no_auth,
        });
        return parsedItem;
      }),
      nextCursor: result.next_cursor,
      totalPages: result.total_pages,
    });

    return parsedResult;
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
  async get(query: ToolkitListParams): Promise<ToolKitListResponse>;

  /**
   * Implementation method that handles both overloads for retrieving toolkits.
   *
   * @param {string | ToolkitListParams} arg - Either a toolkit slug or query parameters
   * @returns {Promise<ToolkitRetrieveResponse | ToolKitListResponse>} The toolkit or list of toolkits
   */
  async get(
    arg: string | ToolkitListParams
  ): Promise<ToolkitRetrieveResponse | ToolKitListResponse> {
    if (typeof arg === 'string') {
      return this.getToolkitBySlug(arg);
    }
    return this.getToolkits(arg);
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
  private async getToolkitBySlug(slug: string): Promise<ToolkitRetrieveResponse> {
    try {
      const result = await this.client.toolkits.retrieve(slug);
      const parsedResult = ToolkitRetrieveResponseSchema.parse({
        name: result.name,
        slug: result.slug,
        meta: {
          ...result.meta,
          createdAt: result.meta.created_at,
          updatedAt: result.meta.updated_at,
          toolsCount: result.meta.tools_count,
          triggersCount: result.meta.triggers_count,
          // appUrl: result.meta.app_url, @TODO Update the client type to include this
        },
        isLocalToolkit: result.is_local_toolkit,
        composioManagedAuthSchemes: result.composio_managed_auth_schemes,
        authConfigDetails: result.auth_config_details?.map(authConfig => ({
          name: authConfig.name,
          mode: authConfig.mode,
          fields: {
            authConfigCreation: authConfig.fields.auth_config_creation,
            connectedAccountInitiation: authConfig.fields.connected_account_initiation,
          },
          proxy: {
            baseUrl: authConfig.proxy?.base_url,
          },
        })),
      });
      return parsedResult;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError(error);
      }
      throw new ComposioToolNotFoundError(`Toolkit with slug ${slug} not found`, {
        slug,
      });
    }
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
    const parsedResult = ToolkitRetrieveCategoriesResponseSchema.parse({
      items: result.items.map(item => {
        const parsedItem = ToolkitCategorySchema.parse({
          id: item.id,
          name: item.name,
        });
        return parsedItem;
      }),
      nextCursor: result.next_cursor,
      totalPages: result.total_pages,
    });
    return parsedResult;
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
   */
  async authorize(userId: string, toolkitSlug: string): Promise<ConnectionRequest> {
    const toolkit = await this.getToolkitBySlug(toolkitSlug);
    const composioAuthConfig = new AuthConfigs(this.client);
    let authConfigIdToUse: string;
    const authConfig = await composioAuthConfig.list({
      toolkitSlug,
    });
    // pick the first auth config
    authConfigIdToUse = authConfig.items[0]?.id;

    // if no auth config is found, create one for the toolkit
    if (!authConfigIdToUse) {
      // create authConfig using composioManagedAuthSchemes
      if (toolkit.authConfigDetails && toolkit.authConfigDetails.length > 0) {
        const authConfig = await composioAuthConfig.create(toolkitSlug, {
          type: 'use_composio_managed_auth',
          name: `${toolkit.name} Auth Config`,
        });
        authConfigIdToUse = authConfig.id;
      } else {
        throw new ComposioAuthConfigNotFoundError('No auth config found for toolkit', {
          toolkitSlug,
        });
      }
    }

    // create the auth config
    const composioConnectedAccount = new ConnectedAccounts(this.client);
    return await composioConnectedAccount.initiate(userId, authConfigIdToUse);
  }
}
