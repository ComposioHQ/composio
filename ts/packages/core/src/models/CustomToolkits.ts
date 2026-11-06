/**
 * @fileoverview `composio.experimental.customToolkits`: register and manage
 * project-owned custom toolkits.
 * **Experimental — custom toolkits are in pilot; shape may change.**
 *
 * @module CustomToolkits
 */
import ComposioClient from '@composio/client';
import {
  CustomToolkitCreateParams,
  CustomToolkitCreateParamsSchema,
  CustomToolkitCreateResponse,
  CustomToolkitDeleteResponse,
  CustomToolkitSyncParams,
  CustomToolkitSyncParamsSchema,
  CustomToolkitSyncResponse,
  CustomToolkitUpdateParams,
  CustomToolkitUpdateParamsSchema,
  CustomToolkitUpdateResponse,
  CustomToolkitUpsertParams,
  CustomToolkitUpsertParamsSchema,
  CustomToolkitUpsertResponse,
} from '../types/customToolkits.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { withCancellation } from '../utils/cancellation';
import logger from '../utils/logger';
import {
  transformCustomToolkitCreateParams,
  transformCustomToolkitCreateResponse,
  transformCustomToolkitDeleteResponse,
  transformCustomToolkitSyncParams,
  transformCustomToolkitSyncResponse,
  transformCustomToolkitUpdateParams,
  transformCustomToolkitUpdateResponse,
  transformCustomToolkitUpsertParams,
  transformCustomToolkitUpsertResponse,
} from '../utils/transformers/customToolkits';

const UPSERT_DEPRECATION =
  '[Deprecation] composio.experimental.customToolkits.upsert() is deprecated. ' +
  'Use create() for a new toolkit and update(slug, ...) to change its name, logo or API key field.';
let _upsertDeprecationWarned = false;

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
 * const { slug } = await composio.experimental.customToolkits.create({
 *   name: 'My Toolkit',
 *   mcpUrl: 'https://mcp.example.com/mcp',
 *   authSchemes: [{ mode: 'DCR_OAUTH', discoveryUrl: 'https://mcp.example.com/.well-known/oauth-authorization-server' }],
 *   userId: 'all',
 * });
 * await composio.experimental.customToolkits.update(slug, { name: 'My Renamed Toolkit' });
 * ```
 */
export class CustomToolkits {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'CustomToolkits');
  }

  /**
   * Creates a custom MCP toolkit and returns its generated slug.
   * **Experimental — custom toolkits are in pilot; shape may change.**
   *
   * Set `userId` to `'all'` to share the toolkit with every user in the
   * project, or to a user ID to make it private to that user. `mcpUrl`,
   * `authSchemes` and `userId` cannot change later: delete and re-create the
   * toolkit instead. For a private toolkit, `connectLink` is where to send
   * that user to connect.
   *
   * @param {CustomToolkitCreateParams} params - The toolkit to create
   * @returns {Promise<CustomToolkitCreateResponse>} The toolkit's slug and, for a private toolkit, a connect link
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * const { slug, connectLink } = await composio.experimental.customToolkits.create({
   *   name: 'Internal API',
   *   mcpUrl: 'https://mcp.internal.example.com/mcp',
   *   authSchemes: [
   *     { mode: 'API_KEY', headers: { Authorization: 'Bearer {{generic_api_key}}' } },
   *   ],
   *   userId: 'user_123',
   * });
   * ```
   */
  async create(
    params: CustomToolkitCreateParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<CustomToolkitCreateResponse> {
    const parsedParams = CustomToolkitCreateParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse custom toolkit create params', {
        cause: parsedParams.error,
      });
    }
    const body = transformCustomToolkitCreateParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.custom.createToolkit(body, requestOptions),
      requestOptions?.signal
    );
    return transformCustomToolkitCreateResponse(result);
  }

  /**
   * Updates a custom toolkit's name, logo or API key field copy. Omitted
   * fields keep their current value.
   * **Experimental — custom toolkits are in pilot; shape may change.**
   *
   * On a project with 2FA enabled, updating a private toolkit requires the
   * `userId` it is private to.
   *
   * @param {string} slug - The custom toolkit slug returned by `create()`
   * @param {CustomToolkitUpdateParams} params - At least one of `name`, `logoFile`, `apiKeyField`
   * @returns {Promise<CustomToolkitUpdateResponse>} `{ success: true }`
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * await composio.experimental.customToolkits.update('CUSTOM_INTERNAL_API_K7F2Q', {
   *   name: 'Internal API (prod)',
   *   userId: 'user_123',
   * });
   * ```
   */
  async update(
    slug: string,
    params: CustomToolkitUpdateParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<CustomToolkitUpdateResponse> {
    const parsedParams = CustomToolkitUpdateParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse custom toolkit update params', {
        cause: parsedParams.error,
      });
    }
    const body = transformCustomToolkitUpdateParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.custom.updateToolkits(slug, body, requestOptions),
      requestOptions?.signal
    );
    return transformCustomToolkitUpdateResponse(result);
  }

  /**
   * Creates a custom toolkit, or updates its display metadata (name, API key
   * field copy) when the project already owns a toolkit with this slug.
   * **Experimental — custom toolkits are in pilot; shape may change.**
   *
   * `mcpUrl` and `authSchemes` cannot change on an existing toolkit:
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
   *     mcpUrl: 'https://mcp.internal.example.com/mcp',
   *     authSchemes: [
   *       { mode: 'API_KEY', headers: { Authorization: 'Bearer {{generic_api_key}}' } },
   *     ],
   *   },
   * });
   * ```
   *
   * @deprecated Use `create()` for a new toolkit and `update(slug, ...)` to change
   *   its name, logo or API key field. `create()` generates the slug, so store the
   *   slug it returns.
   */
  async upsert(
    params: CustomToolkitUpsertParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<CustomToolkitUpsertResponse> {
    if (!_upsertDeprecationWarned) {
      _upsertDeprecationWarned = true;
      logger.warn(UPSERT_DEPRECATION);
    }
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
      () => this.client.custom.deleteToolkit(slug, {}, requestOptions),
      requestOptions?.signal
    );
    return transformCustomToolkitDeleteResponse(result);
  }
}
