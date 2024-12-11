import { TriggerData, PusherUtils } from "../utils/pusher";
import logger from "../../utils/logger";
import { BackendClient } from "./backendClient";

import apiClient from "../client/client";

import { CEG } from "../utils/error";
import { ListTriggersData } from "../client";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

type RequiredQuery = ListTriggersData["query"];

export class Triggers {
  trigger_to_client_event = "trigger_to_client";

  backendClient: BackendClient;
  fileName: string = "js/src/sdk/models/triggers.ts";
  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
  }

  /**
   * Retrieves a list of all triggers in the Composio platform.
   *
   * This method allows you to fetch a list of all the available triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {ListTriggersData} data The data for the request.
   * @returns {CancelablePromise<ListTriggersResponse>} A promise that resolves to the list of all triggers.
   * @throws {ApiError} If the request fails.
   */
  async list(data: RequiredQuery = {}) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const { data: response } = await apiClient.triggers.listTriggers({
        query: {
          appNames: data?.appNames,
        },
      });
      return response || [];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Setup a trigger for a connected account.
   *
   * @param {SetupTriggerData} data The data for the request.
   * @returns {CancelablePromise<SetupTriggerResponse>} A promise that resolves to the setup trigger response.
   * @throws {ApiError} If the request fails.
   */
  async setup({
    connectedAccountId,
    triggerName,
    config,
  }: {
    connectedAccountId: string;
    triggerName: string;
    config: Record<string, any>;
  }): Promise<{ status: string; triggerId: string }> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "setup",
      file: this.fileName,
      params: { connectedAccountId, triggerName, config },
    });
    try {
      const response = await apiClient.triggers.enableTrigger({
        path: {
          connectedAccountId,
          triggerName,
        },
        body: {
          triggerConfig: config,
        },
      });
      return response.data as { status: string; triggerId: string };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async enable(data: { triggerId: string }) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "enable",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.triggers.switchTriggerInstanceStatus({
        path: data,
        body: {
          enabled: true,
        },
      });
      return {
        status: "success",
      };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async disable(data: { triggerId: string }) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "disable",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.triggers.switchTriggerInstanceStatus({
        path: data,
        body: {
          enabled: false,
        },
      });
      return {
        status: "success",
      };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async delete(data: { triggerInstanceId: string }) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.triggers.deleteTrigger({
        path: data,
      });
      return {
        status: "success",
      };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async subscribe(
    fn: (data: TriggerData) => void,
    filters: {
      appName?: string;
      triggerId?: string;
      connectionId?: string;
      integrationId?: string;
      triggerName?: string;
      triggerData?: string;
      entityId?: string;
    } = {}
  ) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "subscribe",
      file: this.fileName,
      params: { filters },
    });
    if (!fn) throw new Error("Function is required for trigger subscription");
    //@ts-ignore
    const clientId = await this.backendClient.getClientId();
    //@ts-ignore
    await PusherUtils.getPusherClient(
      this.backendClient.baseUrl,
      this.backendClient.apiKey
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
    //@ts-ignore
    const clientId = await this.backendClient.getClientId();
    PusherUtils.triggerUnsubscribe(clientId);
  }
}
