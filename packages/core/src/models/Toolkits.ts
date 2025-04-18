import ComposioClient from "@composio/client";
import { RequestOptions } from "@composio/client/internal/request-options";
import {
  ToolkitListParams,
  ToolkitListResponse,
  ToolkitRetrieveCategoriesResponse,
  ToolkitRetrieveResponse,
} from "@composio/client/resources/toolkits";
import { InstrumentedInstance } from "../types/telemetry.types";




/**
 * Toolkits class
 *
 * Toolkits are a collection of tools that can be used to perform various tasks.
 * This is similar/replacement of `apps` in the Composio API.
 */
export class Toolkits implements InstrumentedInstance {
  readonly FILE_NAME: string = "core/models/Toolkits.ts";
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
  }
  /**
   * List all toolkits available in the Composio SDK.
   * This method fetches the toolkits from the Composio API.
   * @returns {Promise<Toolkit[]>} List of toolkits
   */
  async list(
    query: ToolkitListParams,
    options?: RequestOptions
  ): Promise<ToolkitListResponse> {
    return this.client.toolkits.list(query, options);
  }

  /**
   * Fetches a toolkit by its Slug.
   * This method retrieves the toolkit from the Composio API.
   * @param slug - The ID of the toolkit to be retrieved
   * @param options - Request options
   * @returns {Promise<ToolkitRetrieveResponse>} The toolkit object
   */
  async get(
    slug: string,
    options?: RequestOptions
  ): Promise<ToolkitRetrieveResponse> {
    return this.client.toolkits.retrieve(slug, options);
  }

  /**
   * Fetches all categories available in the Composio SDK
   *
   * @returns {Promise<ToolkitRetrieveCategoriesResponse>} List of categories
   */
  async listCategories(
    options?: RequestOptions
  ): Promise<ToolkitRetrieveCategoriesResponse> {
    return this.client.toolkits.retrieveCategories(options);
  }
}
