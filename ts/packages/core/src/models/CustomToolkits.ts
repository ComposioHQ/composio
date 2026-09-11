/**
 * @fileoverview `composio.experimental.customToolkits`: register and manage
 * project-owned custom toolkits.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 *
 * @module CustomToolkits
 */
import ComposioClient from '@composio/client';
import {
  CustomToolkitDeleteResponse,
  CustomToolkitSyncParams,
  CustomToolkitSyncParamsSchema,
  CustomToolkitSyncResponse,
  CustomToolkitUpsertParams,
  CustomToolkitUpsertParamsSchema,
  CustomToolkitUpsertResponse,
} from '../types/customToolkits.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { withCancellation } from '../utils/cancellation';
import {
  transformCustomToolkitDeleteResponse,
  transformCustomToolkitSyncParams,
  transformCustomToolkitSyncResponse,
  transformCustomToolkitUpsertParams,
  transformCustomToolkitUpsertResponse,
} from '../utils/transformers/customToolkits';

/**
 * `composio.experimental.customToolkits` — toolkits your project registers
 * from its own app or MCP server, with their own auth configs and connected
 * accounts. **Experimental — custom toolkits are in pilot; shape may change.**
 *
 * These live on the Composio platform. They are unrelated to the in-process
 * toolkits built with `experimental_createToolkit()`, which run inside your
 * application.
 *
 * @example
 * ```typescript
 * const { slug } = await composio.experimental.customToolkits.upsert({
 *   slug: 'MY_TOOLKIT',
 *   toolkitConfig: {
 *     name: 'My Toolkit',
 *     appUrl: 'https://mcp.example.com/mcp',
 *     authSchemes: [{ mode: 'DCR_OAUTH', discoveryUrl: 'https://mcp.example.com/.well-known/oauth-authorization-server' }],
 *   },
 * });
 * await composio.experimental.customToolkits.sync(slug);
 * ```
 */
export class CustomToolkits {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'CustomToolkits');
  }

  /**
   * Creates a custom toolkit, or updates its display metadata (name, API key
   * field copy) when the project already owns a toolkit with this slug.
   * **Experimental — custom toolkits are in pilot; shape may change.**
   *
   * `appUrl` and `authSchemes` cannot change on an existing toolkit:
   * re-sending them unchanged is a no-op, and changing them fails with a 409.
   * Delete and re-register the toolkit instead, which revokes its connections.
   *
   * @param {CustomToolkitUpsertParams} params - The slug and toolkit configuration
   * @returns {Promise<CustomToolkitUpsertResponse>} The toolkit's slug
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * await composio.experimental.customToolkits.upsert({
   *   slug: 'INTERNAL_API',
   *   toolkitConfig: {
   *     name: 'Internal API',
   *     appUrl: 'https://mcp.internal.example.com/mcp',
   *     authSchemes: [
   *       { mode: 'API_KEY', headers: { Authorization: 'Bearer {{generic_api_key}}' } },
   *     ],
   *   },
   * });
   * ```
   */
  async upsert(
    params: CustomToolkitUpsertParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<CustomToolkitUpsertResponse> {
    const parsedParams = CustomToolkitUpsertParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse custom toolkit upsert params', {
        cause: parsedParams.error,
      });
    }
    const body = transformCustomToolkitUpsertParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.custom.upsert(body, requestOptions),
      requestOptions?.signal
    );
    return transformCustomToolkitUpsertResponse(result);
  }

  /**
   * Re-fetches the tool definitions of a custom toolkit from its remote MCP
   * server. Call it when automatic sync fails or the remote tools change.
   * **Experimental — custom toolkits are in pilot; shape may change.**
   *
   * @param {string} slug - The custom toolkit slug (`CUSTOM_...`)
   * @param {CustomToolkitSyncParams} [params] - Optional connected account to fetch the definitions with
   * @returns {Promise<CustomToolkitSyncResponse>} The toolkit version and number of tools synced
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const { version, syncedCount } = await composio.experimental.customToolkits.sync(
   *   'CUSTOM_MY_TOOLKIT',
   *   { connectedAccountId: 'ca_abc123' }
   * );
   * ```
   */
  async sync(
    slug: string,
    params?: CustomToolkitSyncParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<CustomToolkitSyncResponse> {
    const parsedParams = CustomToolkitSyncParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse custom toolkit sync params', {
        cause: parsedParams.error,
      });
    }
    const body = transformCustomToolkitSyncParams(slug, parsedParams.data);
    const result = await withCancellation(
      () => this.client.custom.sync(body, requestOptions),
      requestOptions?.signal
    );
    return transformCustomToolkitSyncResponse(result);
  }

  /**
   * Deletes a custom toolkit owned by the project, with its tools, auth
   * configs and connected accounts. The credentials behind those connected
   * accounts are revoked in background jobs (`revokeJobIds`).
   * **Experimental — custom toolkits are in pilot; shape may change.**
   *
   * Composio-managed toolkits cannot be deleted; the API answers 403.
   *
   * @param {string} slug - The custom toolkit slug (`CUSTOM_...`)
   * @returns {Promise<CustomToolkitDeleteResponse>} What was deleted
   *
   * @example
   * ```typescript
   * const result = await composio.experimental.customToolkits.delete('CUSTOM_MY_TOOLKIT');
   * console.log(result.connectedAccountsDeleted);
   * ```
   */
  async delete(
    slug: string,
    requestOptions?: ComposioRequestOptions
  ): Promise<CustomToolkitDeleteResponse> {
    const result = await withCancellation(
      () => this.client.custom.deleteToolkit(slug, requestOptions),
      requestOptions?.signal
    );
    return transformCustomToolkitDeleteResponse(result);
  }
}
