import ComposioClient, { APIError } from '@composio/client';
import {
  TriggerInstanceListActiveResponse as TriggerInstanceListActiveResponseComposio,
  TriggersTypeListParams,
  TriggersTypeListResponse,
  TriggersTypeRetrieveEnumResponse,
  TriggersTypeRetrieveResponse,
} from '@composio/client/resources/index';
import {
  TriggerInstanceUpsertResponseSchema,
  TriggerInstanceUpsertResponse,
  TriggerInstanceUpsertParamsSchema,
  TriggerInstanceUpsertParams,
  TriggerInstanceListActiveParams,
  TriggerInstanceListActiveParamsSchema,
  TriggerInstanceListActiveResponse,
  TriggerInstanceListActiveResponseItemSchema,
  TriggerInstanceListActiveResponseSchema,
  TriggerSubscribeParams,
  TriggerInstanceManageUpdateParams,
  TriggerInstanceManageUpdateResponse,
  TriggerInstanceManageDeleteResponse,
  TriggerInstanceManageDeleteResponseSchema,
  TriggerSubscribeParamSchema,
  IncomingTriggerPayloadSchema,
  IncomingTriggerPayload,
  TriggerData,
} from '../types/triggers.types';
import logger from '../utils/logger';
import { telemetry } from '../telemetry/Telemetry';
import { ComposioConnectedAccountNotFoundError, ValidationError } from '../errors';
import { PusherService } from '../services/pusher/Pusher';
import { ComposioTriggerTypeNotFoundError } from '../errors/TriggerErrors';
/**
 * Trigger (Instance) class
 * /api/v3/trigger_instances
 *
 */
export class Triggers {
  private client: ComposioClient;
  private pusherService: PusherService;

  constructor(client: ComposioClient) {
    this.client = client;
    this.pusherService = new PusherService(client);
    telemetry.instrument(this);
  }

  /**
   * Parse the trigger instance list active item
   *
   * @param response - The response from the composio client
   * @returns The parsed trigger instance list active item
   */
  private parseTriggerInstanceListActiveItem(
    response: TriggerInstanceListActiveResponseComposio['items'][0]
  ) {
    const parsed = TriggerInstanceListActiveResponseItemSchema.safeParse({
      id: response.id,
      connectedAccountId: response.connected_account_id,
      disabledAt: response.disabled_at,
      state: response.state,
      triggerConfig: response.trigger_config,
      triggerName: response.trigger_name,
      updatedAt: response.updated_at,
      triggerData: response.trigger_data,
      uuid: response.uuid,
    });
    if (!parsed.success) {
      throw new ValidationError(`Invalid trigger instance list active item`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  /**
   * Fetch list of all the active triggers
   *
   * @param {TriggerInstanceListActiveParams} query - The query parameters to filter the trigger instances
   * @returns {Promise<TriggerInstanceListActiveResponse>} List of trigger instances
   *
   * @throws {ValidationError} If the parameters are invalid
   * @throws {Error} If the client is not authenticated
   *
   * @example
   * ```ts
   * const triggers = await triggers.listActive({
   *   authConfigIds: ['123'],
   *   connectedAccountIds: ['456'],
   * });
   * ```
   */
  async listActive(
    query?: TriggerInstanceListActiveParams
  ): Promise<TriggerInstanceListActiveResponse> {
    // Validate the parameters if provided

    const parsedParams = TriggerInstanceListActiveParamsSchema.safeParse(query ?? {});

    if (!parsedParams.success) {
      throw new ValidationError(`Invalid parameters passed to list triggers`, {
        cause: parsedParams.error,
      });
    }

    const result = await this.client.triggerInstances.listActive(
      query
        ? {
            auth_config_ids: parsedParams.data.authConfigIds,
            connected_account_ids: parsedParams.data.connectedAccountIds,
            limit: parsedParams.data.limit,
            page: parsedParams.data.page,
            show_disabled: parsedParams.data.showDisabled,
            trigger_ids: parsedParams.data.triggerIds,
            trigger_names: parsedParams.data.triggerNames,
          }
        : undefined
    );

    const parsedResult = TriggerInstanceListActiveResponseSchema.safeParse({
      items: result.items.map(item => this.parseTriggerInstanceListActiveItem(item)),
      nextCursor: result.next_cursor,
      totalPages: result.total_pages,
    } as TriggerInstanceListActiveResponse);

    if (!parsedResult.success) {
      throw new ValidationError(`Invalid trigger instance list active response`, {
        cause: parsedResult.error,
      });
    }

    return parsedResult.data;
  }

  /**
   * Create a new trigger instance for a user
   * If the connected account id is not provided, the first connected account for the user and toolkit will be used
   *
   * @param {string} userId - The user id of the trigger instance
   * @param {string} slug - The slug of the trigger instance
   * @param {TriggerInstanceUpsertParams} body - The parameters to create the trigger instance
   * @returns {Promise<TriggerInstanceUpsertResponse>} The created trigger instance
   */
  async create(
    userId: string,
    slug: string,
    body?: TriggerInstanceUpsertParams
  ): Promise<TriggerInstanceUpsertResponse> {
    const parsedBody = TriggerInstanceUpsertParamsSchema.safeParse(body ?? {});

    if (!parsedBody.success) {
      throw new ValidationError(`Invalid parameters passed to create trigger`, {
        cause: parsedBody.error,
      });
    }

    // Get the connected account id from the user id
    let triggerType: TriggersTypeRetrieveResponse;
    let toolkitSlug: string;
    try {
      triggerType = await this.getType(slug);
      toolkitSlug = triggerType.toolkit.slug;
    } catch (error) {
      // for some reason, the triggers types list endpoint returns 400 for invalid user ids
      if (error instanceof APIError && (error.status === 400 || error.status === 404)) {
        throw new ComposioTriggerTypeNotFoundError(`Trigger type ${slug} not found`, {
          cause: error,
          possibleFixes: [
            `Please check the trigger slug`,
            `Visit the toolkit page to see the available triggers`,
          ],
        });
      } else {
        throw error;
      }
    }

    // Attempt to get connected account ID
    let connectedAccountId: string | undefined = body?.connectedAccountId;

    try {
      const { items: connectedAccounts } = await this.client.connectedAccounts.list({
        user_ids: [userId],
        toolkit_slugs: [toolkitSlug],
      });

      if (connectedAccounts.length === 0) {
        throw new ComposioConnectedAccountNotFoundError(
          `No connected account found for user ${userId} for toolkit ${toolkitSlug}`,
          {
            cause: new Error(`No connected account found for user ${userId}`),
            possibleFixes: [`Create a new connected account for user ${userId}`],
          }
        );
      }

      const accountExists = connectedAccounts.some(acc => acc.id === connectedAccountId);
      // if the connected account id is provided and it does not exist, throw an error
      if (connectedAccountId && !accountExists) {
        throw new ComposioConnectedAccountNotFoundError(
          `Connected account ID ${connectedAccountId} not found for user ${userId}`,
          {
            cause: new Error(
              `Connected account ID ${connectedAccountId} not found for user ${userId}`
            ),
            possibleFixes: [
              `Create a new connected account for user ${userId}`,
              `Verify the connected account ID`,
            ],
          }
        );
      }

      // if the connected account id is not provided, use the first connected account
      if (!connectedAccountId) {
        connectedAccountId = connectedAccounts[0].id;
        logger.warn(
          `[Warn] Multiple connected accounts found for user ${userId}, using the first one. Pass connectedAccountId to select a specific account.`
        );
      }
    } catch (error) {
      if (error instanceof APIError && [400, 404].includes(error.status)) {
        throw new ComposioConnectedAccountNotFoundError(
          `No connected account found for user ${userId} for toolkit ${toolkitSlug}`,
          {
            cause: error,
            possibleFixes: [`Create a new connected account for user ${userId}`],
          }
        );
      }
      throw error;
    }

    const result = await this.client.triggerInstances.upsert(slug, {
      connected_account_id: connectedAccountId,
      trigger_config: parsedBody.data.triggerConfig,
    });

    const parsedResult = TriggerInstanceUpsertResponseSchema.safeParse({
      triggerId: result.trigger_id,
    } as TriggerInstanceUpsertResponse);

    if (!parsedResult.success) {
      throw new ValidationError(`Invalid trigger instance upsert response`, {
        cause: parsedResult.error,
      });
    }

    return parsedResult.data;
  }

  /**
   * Update an existing trigger instance
   *
   * @param {string} triggerId - The Id of the trigger instance
   * @param {TriggerInstanceManageUpdateParams} body - The parameters to update the trigger instance
   * @returns {Promise<TriggerInstanceManageUpdateResponse>} The updated trigger instance response
   */
  async update(
    triggerId: string,
    body: TriggerInstanceManageUpdateParams
  ): Promise<TriggerInstanceManageUpdateResponse> {
    return this.client.triggerInstances.manage.update(triggerId, body);
  }

  /**
   * Delete a trigger instance
   *
   * @param {string} triggerId - The slug of the trigger instance
   * @returns
   */
  async delete(triggerId: string): Promise<TriggerInstanceManageDeleteResponse> {
    const result = await this.client.triggerInstances.manage.delete(triggerId);
    const parsedResult = TriggerInstanceManageDeleteResponseSchema.safeParse({
      triggerId: result.trigger_id,
    } as TriggerInstanceManageDeleteResponse);

    if (!parsedResult.success) {
      throw new ValidationError(`Invalid trigger instance manage delete response`, {
        cause: parsedResult.error,
      });
    }

    return parsedResult.data;
  }

  /**
   * Disable a trigger instance
   *
   * @param {string} triggerId - The id of the trigger instance
   * @returns {Promise<TriggerInstanceUpsertResponse>} The updated trigger instance
   */
  async disable(triggerId: string) {
    return this.client.triggerInstances.manage.update(triggerId, {
      status: 'disable',
    });
  }

  /**
   * Enable a trigger instance
   *
   * @param {string} triggerId - The id of the trigger instance
   * @returns {Promise<TriggerInstanceUpsertResponse>} The updated trigger instance
   */
  async enable(triggerId: string) {
    return this.client.triggerInstances.manage.update(triggerId, {
      status: 'enable',
    });
  }

  /**
   * @TODO Learn about trigger types
   */
  /**
   * List all the trigger types
   *
   * @param {TriggersTypeListParams} query - The query parameters to filter the trigger types
   * @param {RequestOptions} options - Request options
   * @returns {Promise<TriggersTypeListResponse>} The list of trigger types
   */
  async listTypes(query?: TriggersTypeListParams): Promise<TriggersTypeListResponse> {
    return this.client.triggersTypes.list(query);
  }

  /**
   * Retrieve a trigger type by its slug
   *
   * @param {string} slug - The slug of the trigger type
   * @param {RequestOptions} options - request options
   * @returns {Promise<TriggersTypeRetrieveResponse>} The trigger type object
   */
  async getType(slug: string): Promise<TriggersTypeRetrieveResponse> {
    return this.client.triggersTypes.retrieve(slug);
  }

  /**
   * Fetches the list of all the available trigger enums
   *
   * This method is used by the CLI where filters are not required.
   * @param options
   * @returns
   */
  async listEnum(): Promise<TriggersTypeRetrieveEnumResponse> {
    return this.client.triggersTypes.retrieveEnum();
  }

  /**
   * Applies compound filters to the trigger data
   * @param data data to apply filters to
   * @returns True if the trigger data matches the filters, false otherwise
   */
  private shouldSendTriggerAfterFilters(
    filters: TriggerSubscribeParams,
    data: IncomingTriggerPayload
  ): boolean {
    // Check if toolkits filter is provided and matches
    if (
      filters.toolkits?.length &&
      !filters.toolkits
        .map(toolkit => toolkit.toLowerCase())
        .includes(data.toolkitSlug.toLowerCase())
    ) {
      logger.debug(
        'Trigger does not match toolkits filter',
        JSON.stringify(filters.toolkits, null, 2)
      );
      return false;
    }

    // Check if triggerId filter matches
    if (filters.triggerId && filters.triggerId !== data.id) {
      logger.debug(
        'Trigger does not match triggerId filter',
        JSON.stringify(filters.triggerId, null, 2)
      );
      return false;
    }

    // Check if connectedAccountId filter matches
    if (
      filters.connectedAccountId &&
      filters.connectedAccountId !== data.metadata.connectedAccount.id
    ) {
      logger.debug(
        'Trigger does not match connectedAccountId filter',
        JSON.stringify(filters.connectedAccountId, null, 2)
      );
      return false;
    }

    // Check if triggerName filter matches
    if (
      filters.triggerSlug?.length &&
      !filters.triggerSlug
        .map(triggerSlug => triggerSlug.toLowerCase())
        .includes(data.triggerSlug.toLowerCase())
    ) {
      logger.debug(
        'Trigger does not match triggerSlug filter',
        JSON.stringify(filters.triggerSlug, null, 2)
      );
      return false;
    }

    // Check if triggerData filter matches
    if (filters.triggerData && filters.triggerData !== data.metadata.triggerData) {
      logger.debug(
        'Trigger does not match triggerData filter',
        JSON.stringify(filters.triggerData, null, 2)
      );
      return false;
    }

    // Check if userId (clientUniqueUserId) filter matches
    if (filters.userId && filters.userId !== data.metadata.connectedAccount.userId) {
      logger.debug('Trigger does not match userId filter', JSON.stringify(filters.userId, null, 2));
      return false;
    }

    logger.debug('Trigger matches all filters', JSON.stringify(filters, null, 2));
    // If all filters pass or no filters were provided, return true
    return true;
  }

  /**
   * Subscribe to all the triggers
   *
   * @param fn - The function to call when a trigger is received
   * @param filters - The filters to apply to the triggers
   *
   * @example
   * ```ts
   *
   * triggers.subscribe((data) => {
   *   console.log(data);
   * }, );
   * ```
   */
  async subscribe(
    fn: (_data: IncomingTriggerPayload) => void,
    filters: TriggerSubscribeParams = {}
  ) {
    if (!fn) throw new Error('Function is required for trigger subscription');

    const parsedFilters = TriggerSubscribeParamSchema.safeParse(filters);

    if (!parsedFilters.success) {
      throw new ValidationError(`Invalid parameters passed to subscribe to triggers`, {
        cause: parsedFilters.error,
      });
    }

    logger.debug('🔄 Subscribing to triggers with filters: ', JSON.stringify(filters, null, 2));
    await this.pusherService.subscribe((_data: Record<string, unknown>) => {
      logger.debug('Received raw trigger data', JSON.stringify(_data, null, 2));
      // @TODO: This is a temporary fix to get the trigger data
      // ideally we should have a type for the trigger data
      const data = _data as TriggerData;
      const parsedData = IncomingTriggerPayloadSchema.safeParse({
        id: data.metadata.nanoId,
        uuid: data.metadata.id,
        triggerSlug: data.metadata.triggerName,
        toolkitSlug: data.appName,
        userId: data.metadata.connection?.clientUniqueUserId,
        payload: data.payload,
        originalPayload: data.originalPayload,
        metadata: {
          id: data.metadata.nanoId,
          uuid: data.metadata.id,
          triggerConfig: data.metadata.triggerConfig,
          triggerSlug: data.metadata.triggerName,
          toolkitSlug: data.appName,
          triggerData: data.metadata.triggerData,
          connectedAccount: {
            id: data.metadata.connection?.connectedAccountNanoId,
            uuid: data.metadata.connection?.id,
            authConfigId: data.metadata.connection?.authConfigNanoId,
            authConfigUUID: data.metadata.connection?.integrationId,
            userId: data.metadata.connection?.clientUniqueUserId,
            status: data.metadata.connection?.status,
          },
        },
      });

      logger.debug('Parsed trigger data', JSON.stringify(parsedData.data, null, 2));

      if (parsedData.error) {
        throw new ValidationError(`Invalid trigger payload`, {
          cause: parsedData.error,
        });
      }
      if (this.shouldSendTriggerAfterFilters(parsedFilters.data, parsedData.data)) {
        try {
          fn(parsedData.data);
        } catch (error) {
          logger.error('❌ Error in trigger callback:', error);
        }
      } else {
        logger.debug('Trigger does not match filters', JSON.stringify(parsedFilters.data, null, 2));
      }
    });
  }

  /**
   * Unsubscribe from all the triggers
   *
   * @returns {Promise<void>}
   *
   * @example
   * ```ts
   * composio.trigger.subscribe((data) => {
   *   console.log(data);
   * });
   *
   * await triggers.unsubscribe();
   * ```
   */
  async unsubscribe() {
    await this.pusherService.unsubscribe();
  }
}
