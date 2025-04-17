import ComposioSDK from "@composio/client";
import { RequestOptions } from "@composio/client/internal/request-options";
import {
  TriggerInstanceListActiveParams,
  TriggerInstanceRemoveUpsertResponse,
  TriggerInstanceUpdateStatusParams,
  TriggerInstanceUpsertParams,
  TriggerInstanceUpsertResponse,
  TriggersTypeListParams,
  TriggersTypeListResponse,
  TriggersTypeRetrieveEnumResponse,
  TriggersTypeRetrieveResponse,
} from "@composio/client/resources/index";
import { TriggerStatusEnum, TriggerSubscribeParams } from "../types/triggers.types";
import { InstrumentedInstance } from "../types/telemetry.types";
import { PusherUtils, TriggerData } from "../utils/pusher";
import logger from "../utils/logger";
import { Session } from "./Session";




/**
 * Trigger (Instance) class
 * /api/v3/trigger_instances
 *
 */
export class Triggers implements InstrumentedInstance {
  readonly FILE_NAME: string = "core/models/Triggers.ts";
  private client: ComposioSDK;

  constructor(client: ComposioSDK) {
    this.client = client;
  }

  /**
   * Fetch list of all the active triggers
   * @returns {Promise<TriggerInstance[]>} List of trigger instances
   */
  async list(
    query?: TriggerInstanceListActiveParams,
    options?: RequestOptions
  ) {
    return this.client.triggerInstances.listActive(query, options);
  }

  /**
   * Create a new trigger instance
   *
   * @param {string} slug - The slug of the trigger instance
   * @param {TriggerInstanceUpsertParams} body - The parameters to create the trigger instance
   * @returns {Promise<TriggerInstanceUpsertResponse>} The created trigger instance
   */
  async create(
    slug: string,
    body: TriggerInstanceUpsertParams,
    options?: RequestOptions
  ): Promise<TriggerInstanceUpsertResponse> {
    return this.client.triggerInstances.upsert(slug, body, options);
  }

  /**
   * Update an existing trigger instance
   *
   * @param {string} slug - The slug of the trigger instance
   * @param {TriggerInstanceUpsertParams} body - The parameters to create the trigger instance
   * @returns {Promise<TriggerInstanceUpsertResponse>} The updated trigger instance
   */
  async update(
    slug: string,
    body: TriggerInstanceUpsertParams,
    options?: RequestOptions
  ): Promise<TriggerInstanceUpsertResponse> {
    return this.client.triggerInstances.upsert(slug, body, options);
  }

  /**
   * Delete a trigger instance
   *
   * @param {string} slug - The slug of the trigger instance
   * @returns
   */
  async delete(slug: string): Promise<TriggerInstanceRemoveUpsertResponse> {
    return this.client.triggerInstances.removeUpsert(slug);
  }

  /**
   * Update the status of a trigger
   *
   * @param {TriggerStatusEnum} status - The new status of the trigger
   * @param {TriggerInstanceUpdateStatusParams} params - The parameters to update the trigger instance
   * @param {RequestOptions} options - Request options
   * @returns {Promise<TriggerInstanceUpsertResponse>} The updated trigger instance
   */
  async updateStatus(
    status: TriggerStatusEnum,
    params: TriggerInstanceUpdateStatusParams,
    options?: RequestOptions
  ) {
    return this.client.triggerInstances.updateStatus(status, params, options);
  }

  /**
   * Disable a trigger instance
   *
   * @param {string} slug - The slug of the trigger instance
   * @param {RequestOptions options - Request options
   * @returns {Promise<TriggerInstanceUpsertResponse>} The updated trigger instance
   */
  async disable(slug: string, options?: RequestOptions) {
    return this.client.triggerInstances.updateStatus(
      "disable",
      { slug },
      options
    );
  }

  /**
   * Enable a trigger instance
   *
   * @param {string} slug - The slug of the trigger instance
   * @param {RequestOptions options - Request options
   * @returns {Promise<TriggerInstanceUpsertResponse>} The updated trigger instance
   */
  async enable(slug: string, options?: RequestOptions) {
    return this.client.triggerInstances.updateStatus(
      "enable",
      { slug },
      options
    );
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
  async listTypes(query?: TriggersTypeListParams, options?: RequestOptions): Promise<TriggersTypeListResponse> {
    return this.client.triggersTypes.list(query, options);
  }

  /**
   * Retrieve a trigger type by its slug
   * 
   * @param {string} slug - The slug of the trigger type
   * @param {RequestOptions} options - request options
   * @returns {Promise<TriggersTypeRetrieveResponse>} The trigger type object
   */
  async getType(slug: string, options?: RequestOptions): Promise<TriggersTypeRetrieveResponse> {
    return this.client.triggersTypes.retrieve(slug, options);
  }

  /**
   * Fetches the list of all the available trigger enums
   * 
   * This method is used by the CLI where filters are not required.
   * @param options 
   * @returns 
   */
  async listEnum(options?: RequestOptions): Promise<TriggersTypeRetrieveEnumResponse> {
    return this.client.triggersTypes.retrieveEnum(options);
  }

  async subscribe(
    fn: (data: TriggerData) => void,
    filters: TriggerSubscribeParams = {}
  ) {

    if (!fn) throw new Error("Function is required for trigger subscription");

    // @TODO: Get the client id from the backend
    const session = new Session(this.client);
    const sessionInfo = await session.getInfo();
    const clientId = sessionInfo.project?.id;

    if (!clientId) throw new Error("Client ID not found");

    await PusherUtils.getPusherClient(
      this.client.baseURL,
      this.client.apiKey
    );

    const shouldSendTrigger = (data: TriggerData) => {
      if (Object.keys(filters).length === 0) return true;
      else {
        return (
          (!filters.appName ||
            data.appName.toLowerCase() === filters.appName.toLowerCase()) &&
          (!filters.triggerId ||
            data.metadata.id.toLowerCase() ===
              filters.triggerId.toLowerCase()) &&
          (!filters.connectionId ||
            data.metadata.connectionId.toLowerCase() ===
              filters.connectionId.toLowerCase()) &&
          (!filters.triggerName ||
            data.metadata.triggerName.toLowerCase() ===
              filters.triggerName.toLowerCase()) &&
          (!filters.entityId ||
            data.metadata.connection.clientUniqueUserId.toLowerCase() ===
              filters.entityId.toLowerCase()) &&
          (!filters.integrationId ||
            data.metadata.connection.integrationId.toLowerCase() ===
              filters.integrationId.toLowerCase())
        );
      }
    };

    logger.debug("Subscribing to triggers", filters);
    PusherUtils.triggerSubscribe(clientId, (data: TriggerData) => {
      if (shouldSendTrigger(data)) {
        fn(data);
      }
    });
  }

  async unsubscribe() {
    const session = new Session(this.client);
    const sessionInfo = await session.getInfo();
    const clientId = sessionInfo.project?.id;

    if (!clientId) throw new Error("Client ID not found");

    PusherUtils.triggerUnsubscribe(clientId);
  }
}
