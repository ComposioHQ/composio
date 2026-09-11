import ComposioClient from '@composio/client';
import {
  ToolkitListParams,
  ToolKitListResponse,
  ToolkitRetrieveResponse,
  ToolkitsListParamsSchema,
  ToolkitRetrieveCategoriesResponse,
  ToolkitAuthFieldsResponse,
  ToolkitGetManyParams,
  ToolkitGetManySlugsSchema,
  ToolkitsGetManyParamsSchema,
  ToolkitChangelogResponse,
  ToolkitRecommendScopesParams,
  ToolkitRecommendScopesParamsSchema,
  ToolkitRecommendScopesResponse,
  ToolkitListGrantContextsParams,
  ToolkitListGrantContextsParamsSchema,
  ToolkitListGrantContextsResponse,
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
  transformToolkitChangelogResponse,
  transformToolkitListGrantContextsParams,
  transformToolkitListGrantContextsResponse,
  transformToolkitListResponse,
  transformToolkitRecommendScopesParams,
  transformToolkitRecommendScopesResponse,
  transformToolkitRetrieveCategoriesResponse,
  transformToolkitRetrieveResponse,
} from '../utils/transformers/toolkits';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { withCancellation } from '../utils/cancellation';
import { ComposioRequestCancelledError } from '../errors/SDKErrors';
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
  private async getToolkits(
    query: ToolkitListParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolKitListResponse> {
    try {
      const parsedQuery = ToolkitsListParamsSchema.safeParse(query);
      if (!parsedQuery.success) {
        throw new ValidationError('Failed to parse toolkit list query', {
          cause: parsedQuery.error,
        });
      }
      const listParams = {
        category: parsedQuery.data.category,
        managed_by: parsedQuery.data.managedBy,
        sort_by: parsedQuery.data.sortBy,
        cursor: parsedQuery.data.cursor,
        limit: parsedQuery.data.limit,
      };
      const result = await withCancellation(
        () => this.client.toolkits.list(listParams, requestOptions),
        requestOptions?.signal
      );

      return transformToolkitListResponse(result);
    } catch (error) {
      if (error instanceof ComposioRequestCancelledError) {
        throw error;
      }
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
  protected async getToolkitBySlug(
    slug: string,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolkitRetrieveResponse> {
    try {
      const result = await withCancellation(
        () => this.client.toolkits.retrieve(slug, undefined, requestOptions),
        requestOptions?.signal
      );
      return transformToolkitRetrieveResponse(result);
    } catch (error) {
      if (error instanceof ComposioRequestCancelledError) {
        throw error;
      }
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
  async get(
    slug: string,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolkitRetrieveResponse>;

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
  async get(
    query?: ToolkitListParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolKitListResponse>;

  /**
   * Implementation method that handles both overloads for retrieving toolkits.
   *
   * @param {string | ToolkitListParams} arg - Either a toolkit slug or query parameters
   * @param {ComposioRequestOptions} [requestOptions] - Per-request cancellation/timeout options
   * @returns {Promise<ToolkitRetrieveResponse | ToolKitListResponse>} The toolkit or list of toolkits
   */
  async get(
    arg?: string | ToolkitListParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolkitRetrieveResponse | ToolKitListResponse> {
    if (typeof arg === 'string') {
      return this.getToolkitBySlug(arg, requestOptions);
    }
    return this.getToolkits(arg ?? {}, requestOptions);
  }

  /**
   * Retrieves several toolkits by slug in a single request.
   *
   * Returns the same transformed shape as `composio.toolkits.get({ ... })`.
   * Unknown slugs are simply absent from the result.
   *
   * @param {string[]} slugs - The toolkit slugs to retrieve (at least one)
   * @param {ToolkitGetManyParams} [params] - Optional filters and pagination, as for `list`
   * @returns {Promise<ToolKitListResponse>} The matching toolkits
   * @throws {ValidationError} If `slugs` is empty or the params fail validation
   * @throws {ComposioToolkitFetchError} If the request fails
   *
   * @example
   * ```typescript
   * const toolkits = await composio.toolkits.getMany(['github', 'slack']);
   * console.log(toolkits.map(toolkit => toolkit.name)); // ['GitHub', 'Slack']
   * ```
   */
  async getMany(
    slugs: string[],
    params?: ToolkitGetManyParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolKitListResponse> {
    const parsedSlugs = ToolkitGetManySlugsSchema.safeParse(slugs);
    if (!parsedSlugs.success) {
      throw new ValidationError('Failed to parse toolkit slugs', {
        cause: parsedSlugs.error,
      });
    }
    const parsedParams = ToolkitsGetManyParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse toolkit getMany params', {
        cause: parsedParams.error,
      });
    }
    const body = {
      toolkits: parsedSlugs.data,
      category: parsedParams.data.category,
      managed_by: parsedParams.data.managedBy,
      sort_by: parsedParams.data.sortBy,
      cursor: parsedParams.data.cursor,
      limit: parsedParams.data.limit,
    };
    try {
      const result = await withCancellation(
        () => this.client.toolkits.retrieveMulti(body, requestOptions),
        requestOptions?.signal
      );
      return transformToolkitListResponse(result);
    } catch (error) {
      if (error instanceof ComposioRequestCancelledError) {
        throw error;
      }
      throw new ComposioToolkitFetchError('Failed to fetch toolkits', {
        meta: { slugs: parsedSlugs.data },
        cause: error,
      });
    }
  }

  /**
   * Retrieves the version changelog of every toolkit (the last 10 versions
   * per toolkit).
   *
   * @returns {Promise<ToolkitChangelogResponse>} Toolkits with their recent version changelogs
   *
   * @example
   * ```typescript
   * const { items } = await composio.toolkits.changelog();
   * const github = items.find(item => item.slug === 'github');
   * console.log(github?.versions[0]); // { version: '20250909_00', changelog: '...' }
   * ```
   */
  async changelog(requestOptions?: ComposioRequestOptions): Promise<ToolkitChangelogResponse> {
    const result = await withCancellation(
      () => this.client.toolkits.retrieveChangelog(requestOptions),
      requestOptions?.signal
    );
    return transformToolkitChangelogResponse(result);
  }

  /**
   * Recommends the OAuth scopes to request so a connection can run the given
   * tools.
   * **Experimental — the API marks this endpoint beta; shape may change.**
   *
   * The answer comes in two variants: `leastPrivilege` (narrowest documented
   * scope per requirement) and `fewest` (smallest set covering everything).
   * Pass `toolkitVersion` from a previous answer to pin the computation.
   *
   * @param {string} toolkitSlug - The toolkit to recommend scopes for
   * @param {ToolkitRecommendScopesParams} params - Tools to cover (`[]` for the whole toolkit), auth scheme, grant context and scope constraints
   * @returns {Promise<ToolkitRecommendScopesResponse>} The recommended scope sets
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const { scopes } = await composio.toolkits.recommendScopes('gmail', {
   *   tools: ['GMAIL_SEND_EMAIL', 'GMAIL_FETCH_EMAILS'],
   * });
   * console.log(scopes.leastPrivilege);
   * ```
   */
  async recommendScopes(
    toolkitSlug: string,
    params: ToolkitRecommendScopesParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolkitRecommendScopesResponse> {
    const parsedParams = ToolkitRecommendScopesParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse toolkit recommendScopes params', {
        cause: parsedParams.error,
      });
    }
    const body = transformToolkitRecommendScopesParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.toolkits.recommendScopes(toolkitSlug, body, requestOptions),
      requestOptions?.signal
    );
    return transformToolkitRecommendScopesResponse(result);
  }

  /**
   * Lists the grant-context dimensions a toolkit's scope recommendation
   * depends on (for example the Google account type), with their allowed
   * values and the default the API assumes.
   * **Experimental — the API marks this endpoint beta; shape may change.**
   *
   * Pass a dimension and a value as `grantContext` to
   * `composio.toolkits.recommendScopes()` to tailor the recommendation.
   *
   * @param {string} toolkitSlug - The toolkit to list grant contexts for
   * @param {ToolkitListGrantContextsParams} [params] - Optional auth scheme and toolkit version
   * @returns {Promise<ToolkitListGrantContextsResponse>} The dimensions and the default grant context
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const { grantContextDimensions } = await composio.toolkits.listGrantContexts('gmail');
   * const [accountType] = grantContextDimensions;
   * const { scopes } = await composio.toolkits.recommendScopes('gmail', {
   *   tools: ['GMAIL_SEND_EMAIL'],
   *   grantContext: { [accountType.dimension]: accountType.values[0] },
   * });
   * ```
   */
  async listGrantContexts(
    toolkitSlug: string,
    params?: ToolkitListGrantContextsParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolkitListGrantContextsResponse> {
    const parsedParams = ToolkitListGrantContextsParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse toolkit listGrantContexts params', {
        cause: parsedParams.error,
      });
    }
    const query = transformToolkitListGrantContextsParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.toolkits.retrieveScopesGrantContext(toolkitSlug, query, requestOptions),
      requestOptions?.signal
    );
    return transformToolkitListGrantContextsResponse(result);
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
  async listCategories(
    requestOptions?: ComposioRequestOptions
  ): Promise<ToolkitRetrieveCategoriesResponse> {
    const result = await withCancellation(
      () => this.client.toolkits.retrieveCategories(requestOptions),
      requestOptions?.signal
    );
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
    authConfigId?: string,
    requestOptions?: ComposioRequestOptions
  ): Promise<ConnectionRequest> {
    // High-level helper that fans out to 3-4 network calls (toolkit retrieve,
    // optional authConfigs list, optional authConfigs create, then
    // connectedAccounts.initiate). Forward the caller's signal to every
    // underlying call so the whole composite is cancellable as a single unit.
    const toolkit = await this.getToolkitBySlug(toolkitSlug, requestOptions);
    const composioAuthConfig = new AuthConfigs(this.client);
    let authConfigIdToUse: string | undefined = authConfigId;

    if (!authConfigIdToUse) {
      const authConfig = await composioAuthConfig.list(
        {
          toolkit: toolkitSlug,
        },
        requestOptions
      );
      // pick the first auth config if none is passed
      authConfigIdToUse = authConfig.items[0]?.id;
    }

    // if no auth config is found, create one for the toolkit
    if (!authConfigIdToUse) {
      // create authConfig using composioManagedAuthSchemes
      if (toolkit.authConfigDetails && toolkit.authConfigDetails.length > 0) {
        try {
          const authConfig = await composioAuthConfig.create(
            toolkitSlug,
            {
              type: 'use_composio_managed_auth',
              name: `${toolkit.name} Auth Config`,
            },
            requestOptions
          );
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
    return await composioConnectedAccount.initiate(
      userId,
      authConfigIdToUse,
      {
        // in this magic function we allow multiple connected accounts per user for an auth config
        allowMultiple: true,
      },
      requestOptions
    );
  }
}
