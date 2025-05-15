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
  }
  /**
   * List all toolkits available in the Composio SDK.
   * This method fetches the toolkits from the Composio API.
   * @returns {Promise<Toolkit[]>} List of toolkits
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
   * Fetches a toolkit by its Slug.
   * This method retrieves the toolkit from the Composio API.
   * @param slug - The ID of the toolkit to be retrieved
   * @param options - Request options
   * @returns {Promise<ToolkitRetrieveResponse>} The toolkit object
   */
  private async getToolkitBySlug(slug: string): Promise<ToolkitRetrieveResponse> {
    const result = await this.client.toolkits.retrieve(slug);
    const parsedResult = ToolkitRetrieveResponseSchema.parse({
      name: result.name,
      slug: result.slug,
      meta: result.meta,
      isLocalToolkit: result.is_local_toolkit,
      composioManagedAuthSchemes: result.composio_managed_auth_schemes,
      authConfigDetails: result.auth_config_details,
    });
    return parsedResult;
  }

  /**
   * @overload
   * Fetches a toolkit by its Slug or a list of toolkits.
   * @param slug - The ID of the toolkit to be retrieved
   * @returns {Promise<ToolkitRetrieveResponse>} The toolkit object
   */
  async get(slug: string): Promise<ToolkitRetrieveResponse>;
  /**
   * @overload
   * Fetches a list of toolkits.
   * @param query - The parameters to fetch the toolkits
   * @returns {Promise<ToolKitListResponse>} The list of toolkits
   */
  async get(query: ToolkitListParams): Promise<ToolKitListResponse>;
  /**
   * Fetches a toolkit by its Slug or a list of toolkits.
   * This method retrieves the toolkit from the Composio API.
   * @param arg - The ID of the toolkit to be retrieved or a list of parameters
   * @returns {Promise<ToolkitRetrieveResponse | ToolKitListResponse>} The toolkit object or a list of toolkits
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
   * Fetches all categories available in the Composio SDK
   *
   * @returns {Promise<ToolkitRetrieveCategoriesResponse>} List of categories
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
}
