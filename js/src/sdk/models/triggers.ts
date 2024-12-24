import logger from "../../utils/logger";
import { PusherUtils, TriggerData } from "../utils/pusher";
import { BackendClient } from "./backendClient";

import apiClient from "../client/client";

import { z } from "zod";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

import { ListTriggersResponse } from "../client";
import {
  ZTriggerInstanceItems,
  ZTriggerQuery,
  ZTriggerSetupParam,
  ZTriggerSubscribeParam,
} from "../types/trigger";

// Types inferred from zod schemas
export type TTriggerListParam = z.infer<typeof ZTriggerQuery>;
export type TTriggerSetupParam = z.infer<typeof ZTriggerSetupParam>;
export type TTriggerInstanceItems = z.infer<typeof ZTriggerInstanceItems>;
export type TTriggerSubscribeParam = z.infer<typeof ZTriggerSubscribeParam>;

// API response types
export type TriggerListResponse = ListTriggersResponse;
export type TriggerSetupResponse = {
  status: string;
  triggerInstanceId: string;
  /* Deprecated */
  triggerId: string;
};

export class Triggers {
  trigger_to_client_event = "trigger_to_client";

  private backendClient: BackendClient;
  private fileName: string = "js/src/sdk/models/triggers.ts";
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
   * @throws {ComposioError} If the request fails.
   */
  async list(data: TTriggerListParam = {}): Promise<TriggerListResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const {
        appNames,
        triggerIds,
        connectedAccountIds,
        integrationIds,
        showEnabledOnly,
      } = ZTriggerQuery.parse(data);
      const { data: response } = await apiClient.triggers.listTriggers({
        query: {
          appNames: appNames?.join(","),
          triggerIds: triggerIds?.join(","),
          connectedAccountIds: connectedAccountIds?.join(","),
          integrationIds: integrationIds?.join(","),
          showEnabledOnly: showEnabledOnly,
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
   * @throws {ComposioError} If the request fails.
   */
  async setup(params: TTriggerSetupParam): Promise<TriggerSetupResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "setup",
      file: this.fileName,
      params: params,
    });
    try {
      const parsedData = ZTriggerSetupParam.parse(params);
      const response = await apiClient.triggers.enableTrigger({
        path: {
          connectedAccountId: parsedData.connectedAccountId,
          triggerName: parsedData.triggerName,
        },
        body: {
          triggerConfig: parsedData.config,
        },
        throwOnError: true,
      });
      const { triggerId, status } = response.data;
      return {
        triggerId: triggerId!,
        status,
        triggerInstanceId: triggerId!,
      };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Enables a trigger for a connected account.
   *
   * @param {TTriggerInstanceItems} data The data for the request.
   * @returns {Promise<boolean>} A promise that resolves to the response of the enable request.
   * @throws {ComposioError} If the request fails.
   */
  async enable(triggerInstanceId: string) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "enable",
      file: this.fileName,
      params: { triggerInstanceId },
    });
    try {
      await apiClient.triggers.switchTriggerInstanceStatus({
        path: {
          triggerId: triggerInstanceId,
        },
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

  /**
   * Disables a trigger for a connected account.
   *
   * @param {TTriggerInstanceItems} data The data for the request.
   * @returns {Promise<boolean>} A promise that resolves to the response of the disable request.
   * @throws {ComposioError} If the request fails.
   */
  async disable(triggerInstanceId: string) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "disable",
      file: this.fileName,
      params: { triggerInstanceId },
    });
    try {
      await apiClient.triggers.switchTriggerInstanceStatus({
        path: {
          triggerId: triggerInstanceId,
        },
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

  /**
   * Deletes a trigger for a connected account.
   *
   * @param {TTriggerInstanceItems} data The data for the request.
   * @returns {Promise<boolean>} A promise that resolves to the response of the delete request.
   * @throws {ComposioError} If the request fails.
   */
  async delete(data: TTriggerInstanceItems) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZTriggerInstanceItems.parse(data);
      await apiClient.triggers.deleteTrigger({
        path: {
          triggerInstanceId: parsedData.triggerInstanceId,
        },
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
    filters: TTriggerSubscribeParam = {}
  ) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "subscribe",
      file: this.fileName,
      params: { filters },
    });
    if (!fn) throw new Error("Function is required for trigger subscription");

    const clientId = await this.backendClient.getClientId();

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
    const clientId = await this.backendClient.getClientId();
    PusherUtils.triggerUnsubscribe(clientId);
  }
}
