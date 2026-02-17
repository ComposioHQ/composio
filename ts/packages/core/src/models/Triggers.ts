import ComposioClient, { APIError } from '@composio/client';
import { TriggersTypeRetrieveEnumResponse } from '@composio/client/resources/index';
import {
  TriggerInstanceUpsertResponse,
  TriggerInstanceUpsertParamsSchema,
  TriggerInstanceUpsertParams,
  TriggerInstanceListActiveParams,
  TriggerInstanceListActiveParamsSchema,
  TriggerInstanceListActiveResponse,
  TriggerSubscribeParams,
  TriggerInstanceManageUpdateParams,
  TriggerInstanceManageUpdateResponse,
  TriggerInstanceManageDeleteResponse,
  TriggerSubscribeParamSchema,
  IncomingTriggerPayload,
  TriggerData,
  TriggersTypeListParams,
  TriggersTypeListResponse,
  TriggersTypeListParamsSchema,
  TriggersTypeRetrieveResponse,
  VerifyWebhookParams,
  VerifyWebhookParamsSchema,
  VerifyWebhookResult,
  WebhookPayload,
  WebhookPayloadV1Schema,
  WebhookPayloadV2Schema,
  WebhookPayloadV3Schema,
  WebhookTriggerPayloadV3Schema,
  WebhookVersion,
  WebhookVersions,
} from '../types/triggers.types';
import logger from '../utils/logger';
import { telemetry } from '../telemetry/Telemetry';
import { ComposioConnectedAccountNotFoundError, ValidationError } from '../errors';
import { PusherService } from '../services/pusher/Pusher';
import {
  ComposioTriggerTypeNotFoundError,
  ComposioWebhookPayloadError,
  ComposioWebhookSignatureVerificationError,
} from '../errors/TriggerErrors';
import { transform } from '../utils/transform';
import {
  transformIncomingTriggerPayload,
  transformTriggerInstanceListActiveResponse,
  transformTriggerTypeListResponse,
  transformTriggerTypeRetrieveResponse,
} from '../utils/transformers/triggers';
import { ToolkitVersionParam } from '../types/tool.types';
import { ComposioConfig } from '../composio';
import { BaseComposioProvider } from '../provider/BaseProvider';
import { hmacSha256Base64, timingSafeEqual } from '../utils/crypto';
import { CONFIG_DEFAULTS } from '../utils/config-defaults';

/**
 * Safely converts a value to a string, returning the default if the value is null, undefined, or empty.
 * This prevents runtime crashes when calling string methods like `.toLowerCase()` on non-string values.
 * @private
 */
const toStringOrDefault = (value: unknown, defaultValue: string): string => {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const str = String(value);
  return str.length > 0 ? str : defaultValue;
};

/**
 * Trigger (Instance) class
 * /api/v3/trigger_instances
 *
 */
export class Triggers<TProvider extends BaseComposioProvider<unknown, unknown, unknown>> {
  private client: ComposioClient;
  private pusherService: PusherService;
  private toolkitVersions: ToolkitVersionParam;

  constructor(client: ComposioClient, config?: ComposioConfig<TProvider>) {
    this.client = client;
    this.pusherService = new PusherService(client);
    this.toolkitVersions = config?.toolkitVersions ?? CONFIG_DEFAULTS.toolkitVersions;
    telemetry.instrument(this, 'Triggers');
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
            cursor: parsedParams.data.cursor,
            limit: parsedParams.data.limit,
            show_disabled: parsedParams.data.showDisabled,
            trigger_ids: parsedParams.data.triggerIds,
            trigger_names: parsedParams.data.triggerNames,
          }
        : undefined
    );
    return transformTriggerInstanceListActiveResponse(result);
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
            `Please check the provided version of toolkit has the trigger`,
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
      toolkit_versions: this.toolkitVersions,
    });

    return {
      triggerId: result.trigger_id,
    };
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
    return {
      triggerId: result.trigger_id,
    };
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
    const parsedQuery = transform(query ?? {})
      .with(TriggersTypeListParamsSchema)
      .using(raw => raw);

    const result = await this.client.triggersTypes.list({
      cursor: parsedQuery.cursor,
      limit: parsedQuery.limit,
      toolkit_slugs: parsedQuery.toolkits,
      toolkit_versions: this.toolkitVersions,
    });

    return transformTriggerTypeListResponse(result);
  }

  /**
   * Retrieve a trigger type by its slug for the provided version of the app
   * Use the global toolkit versions param when initializing composio to pass a toolkitversion
   *
   * @param {string} slug - The slug of the trigger type
   * @returns {Promise<TriggersTypeRetrieveResponse>} The trigger type object
   */
  async getType(slug: string): Promise<TriggersTypeRetrieveResponse> {
    const result = await this.client.triggersTypes.retrieve(slug, {
      // if the version is provided override the global version
      toolkit_versions: this.toolkitVersions,
    });
    return transformTriggerTypeRetrieveResponse(result);
  }

  /**
   * Fetches the list of all the available trigger enums
   *
   * This method is used by the CLI where filters are not required.
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

      // Parse using unified method that handles V1/V2/V3 and legacy formats
      const parsedData = this.parsePusherPayload(_data);

      if (this.shouldSendTriggerAfterFilters(parsedFilters.data, parsedData)) {
        try {
          fn(parsedData);
        } catch (error) {
          logger.error('❌ Error in trigger callback:', error);
        }
      } else {
        logger.debug('Trigger does not match filters', JSON.stringify(parsedFilters.data, null, 2));
      }
    });
  }

  /**
   * Tries to parse data as V1, V2, or V3 webhook payload format.
   * Returns the parsed result with version info, or null if no format matches.
   * Also returns any schema validation errors for debugging purposes.
   * @private
   */
  private tryParseVersionedPayload(data: unknown):
    | {
        ok: true;
        version: WebhookVersion;
        rawPayload: WebhookPayload;
        normalizedPayload: IncomingTriggerPayload;
      }
    | {
        ok: false;
        v1Error: string;
        v2Error: string;
        v3Error: string;
      } {
    // Try V3 first (has 'composio.trigger.message' type)
    const v3Result = WebhookPayloadV3Schema.safeParse(data);
    if (v3Result.success) {
      return {
        ok: true,
        version: WebhookVersions.V3,
        rawPayload: v3Result.data,
        normalizedPayload: this.normalizeV3Payload(v3Result.data),
      };
    }

    // Try V2 (has 'type', 'timestamp', 'log_id', and 'data')
    const v2Result = WebhookPayloadV2Schema.safeParse(data);
    if (v2Result.success) {
      return {
        ok: true,
        version: WebhookVersions.V2,
        rawPayload: v2Result.data,
        normalizedPayload: this.normalizeV2Payload(v2Result.data),
      };
    }

    // Try V1 (has 'trigger_name', 'connection_id', 'trigger_id', 'payload', 'log_id')
    const v1Result = WebhookPayloadV1Schema.safeParse(data);
    if (v1Result.success) {
      return {
        ok: true,
        version: WebhookVersions.V1,
        rawPayload: v1Result.data,
        normalizedPayload: this.normalizeV1Payload(v1Result.data),
      };
    }

    return {
      ok: false,
      v1Error: v1Result.error.message,
      v2Error: v2Result.error.message,
      v3Error: v3Result.error.message,
    };
  }

  /**
   * Parses incoming Pusher payload, supporting V1, V2, V3, and legacy TriggerData formats.
   * @private
   */
  private parsePusherPayload(data: Record<string, unknown>): IncomingTriggerPayload {
    // Try V1/V2/V3 formats
    const versionedResult = this.tryParseVersionedPayload(data);
    if (versionedResult.ok) {
      logger.debug(`Parsed Pusher payload as ${versionedResult.version} format`);
      return versionedResult.normalizedPayload;
    }

    // Try legacy TriggerData format (for backwards compatibility)
    const legacyData = data as TriggerData;
    if (legacyData.metadata?.nanoId && legacyData.appName) {
      logger.debug('Parsed Pusher payload as legacy TriggerData format');
      return transformIncomingTriggerPayload(legacyData);
    }

    // Fallback: log warning and return a minimal payload with available data
    logger.warn('Unknown Pusher payload format. Payload keys: ' + Object.keys(data).join(', '));

    // Return a minimal payload structure to avoid breaking the subscription
    // Use toStringOrDefault to safely convert values and prevent crashes when
    // non-string values are passed (e.g., numbers, objects) and .toLowerCase() is called later
    const id = toStringOrDefault(data.id, toStringOrDefault(data.trigger_id, 'unknown'));
    const uuid = toStringOrDefault(data.uuid, toStringOrDefault(data.id, 'unknown'));
    const triggerSlug = toStringOrDefault(
      data.triggerSlug,
      toStringOrDefault(data.trigger_name, 'UNKNOWN')
    );
    const toolkitSlug = toStringOrDefault(
      data.toolkitSlug,
      toStringOrDefault(data.appName, 'UNKNOWN')
    );
    const userId = toStringOrDefault(data.userId, '');

    return {
      id,
      uuid,
      triggerSlug,
      toolkitSlug,
      userId,
      payload: (data.payload as Record<string, unknown>) || data,
      originalPayload: (data.originalPayload as Record<string, unknown>) || data,
      metadata: {
        id,
        uuid,
        triggerSlug,
        toolkitSlug,
        triggerConfig: {},
        connectedAccount: {
          id: '',
          uuid: '',
          authConfigId: '',
          authConfigUUID: '',
          userId: '',
          status: 'ACTIVE',
        },
      },
    };
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

  /**
   * Verify an incoming webhook payload and signature.
   *
   * This method validates that the webhook request is authentic by:
   * 1. Verifying the HMAC-SHA256 signature matches the payload using the correct signing format
   * 2. Optionally checking that the webhook timestamp is within the tolerance window
   *
   * The signature is computed as: `HMAC-SHA256(${webhookId}.${webhookTimestamp}.${payload}, secret)`
   * and is expected in the format: `v1,base64EncodedSignature`
   *
   * @param {VerifyWebhookParams} params - The verification parameters
   * @param {string} params.payload - The raw webhook payload as a string (request body)
   * @param {string} params.signature - The signature from the 'webhook-signature' header
   * @param {string} params.secret - The webhook secret used to sign the payload
   * @param {string} params.webhookId - The webhook ID from the 'webhook-id' header
   * @param {string} params.webhookTimestamp - The timestamp from the 'webhook-timestamp' header (Unix seconds)
   * @param {number} [params.tolerance=300] - Maximum allowed age of the webhook in seconds (default: 5 minutes). Set to 0 to disable timestamp validation.
   * @returns {VerifyWebhookResult} The verified and parsed webhook payload with version information
   *
   * @throws {ValidationError} If the parameters are invalid
   * @throws {ComposioWebhookSignatureVerificationError} If the signature verification fails
   * @throws {ComposioWebhookPayloadError} If the payload cannot be parsed or is invalid
   *
   * @example
   * ```ts
   * // In an Express.js webhook handler
   * app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
   *   try {
   *     const result = await composio.triggers.verifyWebhook({
   *       payload: req.body.toString(),
   *       signature: req.headers['webhook-signature'] as string,
   *       webhookId: req.headers['webhook-id'] as string,
   *       webhookTimestamp: req.headers['webhook-timestamp'] as string,
   *       secret: process.env.COMPOSIO_WEBHOOK_SECRET!,
   *     });
   *
   *     // Process the verified payload
   *     console.log('Webhook version:', result.version);
   *     console.log('Received trigger:', result.payload.triggerSlug);
   *     res.status(200).send('OK');
   *   } catch (error) {
   *     console.error('Webhook verification failed:', error);
   *     res.status(401).send('Unauthorized');
   *   }
   * });
   * ```
   */
  async verifyWebhook(params: VerifyWebhookParams): Promise<VerifyWebhookResult> {
    // Validate input parameters
    const parsedParams = VerifyWebhookParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      // Extract missing required parameters for a more helpful error message
      const missingParams = parsedParams.error.issues
        .filter(issue => issue.code === 'invalid_type' && issue.received === 'undefined')
        .map(issue => {
          const paramName = issue.path[0] as string;
          const headerMap: Record<string, string> = {
            id: 'webhook-id',
            timestamp: 'webhook-timestamp',
            signature: 'webhook-signature',
          };
          const headerName = headerMap[paramName];
          return headerName ? `'${paramName}' (from '${headerName}' header)` : `'${paramName}'`;
        });

      if (missingParams.length > 0) {
        throw new ValidationError(
          `Missing required parameters: ${missingParams.join(', ')}. ` +
            `Extract these values from the HTTP request headers and body.`,
          { cause: parsedParams.error }
        );
      }

      throw new ValidationError('Invalid parameters passed to verifyWebhook', {
        cause: parsedParams.error,
      });
    }

    const {
      payload,
      signature,
      secret,
      id: webhookId,
      timestamp: webhookTimestamp,
      tolerance,
    } = parsedParams.data;

    // Validate timestamp if tolerance is set
    if (tolerance > 0) {
      this.validateWebhookTimestamp(webhookTimestamp, tolerance);
    }

    // Verify signature using the correct format: msgId.timestamp.payload
    await this.verifyWebhookSignature(webhookId, webhookTimestamp, payload, signature, secret);

    // Parse the payload and detect version
    const { version, rawPayload, normalizedPayload } = this.parseWebhookPayload(payload);

    return {
      version,
      payload: normalizedPayload,
      rawPayload,
    };
  }

  /**
   * Parses the webhook payload and detects its version (V1, V2, or V3)
   * @private
   */
  private parseWebhookPayload(payload: string): {
    version: WebhookVersion;
    rawPayload: WebhookPayload;
    normalizedPayload: IncomingTriggerPayload;
  } {
    let jsonPayload: unknown;
    try {
      jsonPayload = JSON.parse(payload);
    } catch (error) {
      throw new ComposioWebhookPayloadError('Failed to parse webhook payload as JSON', {
        cause: error,
      });
    }

    // Try V1/V2/V3 formats using shared parsing logic
    const result = this.tryParseVersionedPayload(jsonPayload);
    if (result.ok) {
      const { ok, ...rest } = result;
      return rest;
    }

    const { v1Error, v2Error, v3Error } = result;

    // None of the schemas matched
    throw new ComposioWebhookPayloadError(
      'Webhook payload does not match any known version (V1, V2, or V3). ' +
        'Please ensure you are using a supported webhook payload format.',
      {
        cause: {
          v1Error,
          v2Error,
          v3Error,
        },
      }
    );
  }

  /**
   * Normalizes a V1 webhook payload to IncomingTriggerPayload format
   * @private
   */
  private normalizeV1Payload(
    payload: import('../types/triggers.types').WebhookPayloadV1
  ): IncomingTriggerPayload {
    // V1 has limited information, so we use what's available
    // and mark unknown fields appropriately
    const triggerName = payload.trigger_name;
    const toolkitSlug = triggerName.split('_')[0]?.toUpperCase() || 'UNKNOWN';

    return {
      id: payload.trigger_id,
      uuid: payload.trigger_id, // V1 doesn't have UUID, use trigger_id
      triggerSlug: triggerName,
      toolkitSlug,
      userId: '', // V1 doesn't provide userId
      payload: payload.payload,
      originalPayload: payload.payload,
      metadata: {
        id: payload.trigger_id,
        uuid: payload.trigger_id,
        toolkitSlug,
        triggerSlug: triggerName,
        triggerConfig: {},
        connectedAccount: {
          id: payload.connection_id,
          uuid: payload.connection_id,
          authConfigId: '',
          authConfigUUID: '',
          userId: '',
          status: 'ACTIVE',
        },
      },
    };
  }

  /**
   * Normalizes a V2 webhook payload to IncomingTriggerPayload format
   * @private
   */
  private normalizeV2Payload(
    payload: import('../types/triggers.types').WebhookPayloadV2
  ): IncomingTriggerPayload {
    const triggerSlug = payload.type.toUpperCase();
    const toolkitSlug = triggerSlug.split('_')[0] || 'UNKNOWN';

    // Extract data fields
    const { connection_id, connection_nano_id, trigger_nano_id, trigger_id, user_id, ...restData } =
      payload.data;

    return {
      id: trigger_nano_id,
      uuid: trigger_id,
      triggerSlug,
      toolkitSlug,
      userId: user_id,
      payload: restData,
      originalPayload: restData,
      metadata: {
        id: trigger_nano_id,
        uuid: trigger_id,
        toolkitSlug,
        triggerSlug,
        triggerConfig: {},
        connectedAccount: {
          id: connection_nano_id,
          uuid: connection_id,
          authConfigId: '',
          authConfigUUID: '',
          userId: user_id,
          status: 'ACTIVE',
        },
      },
    };
  }

  /**
   * Normalizes a V3 webhook payload to IncomingTriggerPayload format
   * @private
   */
  private normalizeV3Payload(
    payload: import('../types/triggers.types').WebhookPayloadV3
  ): IncomingTriggerPayload {
    // Check if this is a trigger event with trigger-specific metadata
    const triggerResult = WebhookTriggerPayloadV3Schema.safeParse(payload);
    if (triggerResult.success) {
      const triggerSlug = triggerResult.data.metadata.trigger_slug;
      const toolkitSlug = triggerSlug.split('_')[0]?.toUpperCase() || 'UNKNOWN';

      return {
        id: triggerResult.data.metadata.trigger_id,
        uuid: triggerResult.data.metadata.trigger_id,
        triggerSlug,
        toolkitSlug,
        userId: triggerResult.data.metadata.user_id,
        payload: payload.data,
        originalPayload: payload.data,
        metadata: {
          id: triggerResult.data.metadata.trigger_id,
          uuid: triggerResult.data.metadata.trigger_id,
          toolkitSlug,
          triggerSlug,
          triggerConfig: {},
          connectedAccount: {
            id: triggerResult.data.metadata.connected_account_id,
            uuid: triggerResult.data.metadata.connected_account_id,
            authConfigId: triggerResult.data.metadata.auth_config_id,
            authConfigUUID: triggerResult.data.metadata.auth_config_id,
            userId: triggerResult.data.metadata.user_id,
            status: 'ACTIVE',
          },
        },
      };
    }

    // Non-trigger V3 event (e.g., connection expired)
    // Return a minimal payload; callers should use specific schemas
    // (e.g., ConnectionExpiredEventSchema) on rawPayload for type-safe access
    return {
      id: payload.id,
      uuid: payload.id,
      triggerSlug: payload.type,
      toolkitSlug: 'COMPOSIO',
      userId: '',
      payload: payload.data,
      originalPayload: payload as unknown as Record<string, unknown>,
      metadata: {
        id: payload.id,
        uuid: payload.id,
        toolkitSlug: 'COMPOSIO',
        triggerSlug: payload.type,
        triggerConfig: {},
        connectedAccount: {
          id: '',
          uuid: '',
          authConfigId: '',
          authConfigUUID: '',
          userId: '',
          status: 'ACTIVE',
        },
      },
    };
  }

  /**
   * Verifies the HMAC-SHA256 signature of a webhook payload.
   * The signature format used by Composio is: `v1,base64EncodedSignature`
   * The signing input is: `${msgId}.${timestamp}.${payload}`
   * @private
   */
  private async verifyWebhookSignature(
    webhookId: string,
    webhookTimestamp: string,
    payload: string,
    signature: string,
    secret: string
  ): Promise<void> {
    if (payload.length === 0) {
      throw new ComposioWebhookSignatureVerificationError('No webhook payload was provided.');
    }

    if (signature.length === 0) {
      throw new ComposioWebhookSignatureVerificationError(
        "No signature header value was provided. Please pass the value of the 'webhook-signature' header."
      );
    }

    if (secret.length === 0) {
      throw new ComposioWebhookSignatureVerificationError(
        'No webhook secret was provided. You can find your webhook secret in your Composio dashboard.'
      );
    }

    if (webhookId.length === 0) {
      throw new ComposioWebhookSignatureVerificationError(
        "No webhook ID was provided. Please pass the value of the 'webhook-id' header."
      );
    }

    if (webhookTimestamp.length === 0) {
      throw new ComposioWebhookSignatureVerificationError(
        "No webhook timestamp was provided. Please pass the value of the 'webhook-timestamp' header."
      );
    }

    // Parse signature - may have multiple signatures prefixed with version (e.g., "v1,base64sig")
    const signatures = signature.split(' ');
    const v1Signatures: string[] = [];

    for (const sig of signatures) {
      const [version, value] = sig.split(',');
      if (version === 'v1' && value) {
        v1Signatures.push(value);
      }
    }

    if (v1Signatures.length === 0) {
      throw new ComposioWebhookSignatureVerificationError(
        'No valid v1 signature found in the webhook-signature header. ' +
          "Expected format: 'v1,base64EncodedSignature'"
      );
    }

    // Compute expected signature: HMAC-SHA256(msgId.timestamp.payload, secret) -> base64
    const toSign = `${webhookId}.${webhookTimestamp}.${payload}`;
    const expectedSignature = await hmacSha256Base64(secret, toSign);

    // Check if any of the provided signatures match
    let isValid = false;
    for (const providedSignature of v1Signatures) {
      if (timingSafeEqual(providedSignature, expectedSignature)) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      throw new ComposioWebhookSignatureVerificationError(
        'The signature provided is invalid. Please ensure you are using the correct webhook secret.'
      );
    }
  }

  /**
   * Validates that the webhook timestamp is within the allowed tolerance
   * @private
   */
  private validateWebhookTimestamp(webhookTimestamp: string, tolerance: number): void {
    const timestampSeconds = parseInt(webhookTimestamp, 10);

    if (Number.isNaN(timestampSeconds)) {
      throw new ComposioWebhookPayloadError(
        `Invalid webhook timestamp: ${webhookTimestamp}. Expected Unix timestamp in seconds.`
      );
    }

    const webhookTimeMs = timestampSeconds * 1000;
    const currentTime = Date.now();
    const timeDifference = Math.abs(currentTime - webhookTimeMs);

    if (timeDifference > tolerance * 1000) {
      throw new ComposioWebhookSignatureVerificationError(
        `The webhook timestamp is outside the allowed tolerance. ` +
          `The webhook was sent ${Math.round(timeDifference / 1000)} seconds ago, ` +
          `but the maximum allowed age is ${tolerance} seconds.`
      );
    }
  }
}
