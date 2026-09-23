/**
 * @fileoverview The `composio.sessionConfigs` namespace: read the saved
 * Session configs of the project.
 *
 * @module SessionConfigs
 */
import ComposioClient from '@composio/client';
import {
  SessionConfig,
  SessionConfigListParams,
  SessionConfigListParamsSchema,
  SessionConfigListResponse,
} from '../types/sessionConfigs.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { ValidationError } from '../errors/ValidationErrors';
import { telemetry } from '../telemetry/Telemetry';
import { withCancellation } from '../utils/cancellation';
import {
  transformSessionConfig,
  transformSessionConfigListParams,
  transformSessionConfigListResponse,
} from '../utils/transformers/sessionConfigs';

/**
 * `composio.sessionConfigs` — saved, reusable Session configs.
 *
 * A Session config is a named access policy (`sc_…`) built in the Composio
 * Dashboard under Sessions → Configs. Pass its id as
 * `experimental.sessionConfigId` to `composio.sessions.create()` or
 * `session.update()` to apply it.
 *
 * These endpoints require Session configs to be enabled for the project;
 * otherwise the backend returns 403.
 *
 * @example
 * ```typescript
 * const { items } = await composio.sessionConfigs.list({ search: 'support' });
 * const sessionConfig = await composio.sessionConfigs.get(items[0].id);
 * const session = await composio.sessions.create('user_123', {
 *   experimental: { sessionConfigId: sessionConfig.id },
 * });
 * ```
 */
export class SessionConfigs {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'SessionConfigs');
  }

  /**
   * List the project's saved Session configs with cursor pagination.
   *
   * Omitting `archived` returns active configs; `archived: true` returns only
   * archived ones. The backend defaults `limit` to 20 and caps it at 100.
   *
   * Requires Session configs to be enabled for the project.
   *
   * @param {SessionConfigListParams} [params] - `search`, `archived`, `limit` and `cursor`
   * @returns {Promise<SessionConfigListResponse>} Config summaries and the next cursor
   * @throws {ValidationError} If the params fail validation
   *
   * @example
   * ```typescript
   * let cursor: string | undefined;
   * do {
   *   const page = await composio.sessionConfigs.list({ cursor });
   *   for (const item of page.items) console.log(item.id, item.name);
   *   cursor = page.nextCursor ?? undefined;
   * } while (cursor);
   * ```
   */
  async list(
    params?: SessionConfigListParams,
    requestOptions?: ComposioRequestOptions
  ): Promise<SessionConfigListResponse> {
    const parsedParams = SessionConfigListParamsSchema.safeParse(params ?? {});
    if (!parsedParams.success) {
      throw new ValidationError('Failed to parse session config list params', {
        cause: parsedParams.error,
      });
    }
    const query = transformSessionConfigListParams(parsedParams.data);
    const result = await withCancellation(
      () => this.client.sessionConfigs.list(query, requestOptions),
      requestOptions?.signal
    );
    return transformSessionConfigListResponse(result);
  }

  /**
   * Retrieve one saved Session config with its description and access
   * policy. A missing or cross-project id surfaces as the backend's 404.
   *
   * Requires Session configs to be enabled for the project.
   *
   * @param {string} id - The `sc_…` id of the Session config
   * @returns {Promise<SessionConfig>} The config and its policy
   * @throws {ValidationError} If `id` is empty
   *
   * @example
   * ```typescript
   * const sessionConfig = await composio.sessionConfigs.get('sc_abc123');
   * console.log(sessionConfig.config.toolkits);
   * ```
   */
  async get(id: string, requestOptions?: ComposioRequestOptions): Promise<SessionConfig> {
    // An empty id would request the collection path and return a list page.
    if (id.trim() === '') {
      throw new ValidationError('Session config id must be a non-empty string');
    }
    const result = await withCancellation(
      () => this.client.sessionConfigs.retrieve(id, requestOptions),
      requestOptions?.signal
    );
    return transformSessionConfig(result);
  }
}
