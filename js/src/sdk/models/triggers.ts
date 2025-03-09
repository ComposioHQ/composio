import logger from "../../utils/logger";
import { PusherUtils, TriggerData } from "../utils/pusher";
import { AxiosBackendClient } from "./backendClient";

import apiClient from "../client/client";

import { z } from "zod";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

import { Client } from "@hey-api/client-axios";
import { ListTriggersResponse } from "../client";
import {
  TriggerSingleParam,
  ZSingleTriggerParam,
  ZSingleTriggerRes,
  ZTriggerInstanceItems,
  ZTriggerInstanceParam,
  ZTriggerQuery,
  ZTriggerSetupParam,
  ZTriggerSubscribeParam,
} from "../types/trigger";
import { COMPOSIO_SDK_ERROR_CODES } from "../utils/errors/src/constants";

// Types inferred from zod schemas
export type TriggerListParam = z.infer<typeof ZTriggerQuery> & {
  /** @deprecated use appUniqueKeys field instead */
  appNames?: string[];
};
export type TriggerSetupParam = z.infer<typeof ZTriggerSetupParam>;
export type TriggerInstanceItems = z.infer<typeof ZTriggerInstanceItems>;
export type TriggerSubscribeParam = z.infer<typeof ZTriggerSubscribeParam>;
export type TriggerListRes = Array<z.infer<typeof ZSingleTriggerRes>>;
export type SingleTriggerRes = z.infer<typeof ZSingleTriggerRes>;
export type TriggerSingleConfig = Pick<SingleTriggerRes, "config">;

// API response types
export type TriggerListResponse = ListTriggersResponse;

export type TriggerSetupResponse = {
  status: string;

  /** @deprecated use triggerId field instead */
  triggerInstanceId: string;

  triggerId: string;

  triggerName: string;
};

export type SingleInstanceTriggerParam = z.infer<
  typeof ZTriggerInstanceParam
> & {
  /** @deprecated use triggerId */
  triggerInstanceId?: string;
};

export class Triggers {
  trigger_to_client_event = "trigger_to_client";

  private backendClient: AxiosBackendClient;
  private fileName: string = "js/src/sdk/models/triggers.ts";
  private client: Client;

  constructor(backendClient: AxiosBackendClient, client: Client) {
    this.backendClient = backendClient;
    this.client = client;
  }

  /**
   * Retrieves a list of all triggers in the Composio platform.
   *
   * This method allows you to fetch a list of all the available triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {ListTriggersData} data The data for the request.
   * @returns {Promise<ListTriggersResponse>} A promise that resolves to the list of all triggers.
   * @throws {ComposioError} If the request fails.
   */
  async list(data: TriggerListParam = {}): Promise<TriggerListResponse> {
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
        triggerInstanceIds,
        appUniqueKeys,
      } = ZTriggerQuery.parse(data);

      const finalTriggerInstanceIds =
        triggerIds && triggerIds.length > 0 ? triggerIds : triggerInstanceIds;

      const finalAppNames =
        appNames && appNames.length > 0 ? appNames : appUniqueKeys;
      const { data: response } = await apiClient.triggers.listTriggers({
        client: this.client,
        query: {
          appNames: finalAppNames?.join(","),
          triggerIds: finalTriggerInstanceIds?.join(","),
          connectedAccountIds: connectedAccountIds?.join(","),
          integrationIds: integrationIds?.join(","),
          showEnabledOnly: showEnabledOnly || false,
        },
      });

      if (!response || response.length === 0) {
        throw CEG.getCustomError(COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND, {
          message: "Trigger not found with the given params",
          description: "Trigger not found with the given params",
          possibleFix: "Pass a check if filter params are correct",
        });
      }
      return response;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves the configuration of a single trigger.
   *
   * @param {TriggerSingleParam} data The data for the request.
   * @returns {Promise<TriggerSingleConfig>} A promise that resolves to the trigger configuration.
   * @throws {ComposioError} If the request fails.
   */
  async get(data: TriggerSingleParam): Promise<SingleTriggerRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      client: this.client,
      method: "get",
      file: this.fileName,
      params: { data },
    });
    return this.getTriggerInfo(data);
  }

  /**
   * @deprecated use trigger.get instead
   * Retrieves the configuration of a single trigger.
   *
   * @param {TriggerSingleParam} data The data for the request.
   * @returns {Promise<TriggerSingleConfig>} A promise that resolves to the trigger configuration.
   * @throws {ComposioError} If the request fails.
   */
  async getTriggerConfig(
    data: TriggerSingleParam
  ): Promise<TriggerSingleConfig> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getSingleTriggerConfig",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZSingleTriggerParam.parse(data);

      if (!parsedData.triggerName && !parsedData.triggerId) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
          {
            message: "Trigger name or trigger id is required",
            description: "Trigger name or trigger id is required",
            possibleFix: "Pass either triggerName or triggerId",
          }
        );
      }
      const res = await apiClient.triggers.getTriggerInfoV2({
        client: this.client,
        path: {
          triggerName: parsedData.triggerName || parsedData.triggerId || "",
        },
      });

      // Bad type inference
      const triggerInfo = res.data as unknown as SingleTriggerRes;

      if (!triggerInfo) {
        throw CEG.getCustomError(COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND, {
          message: "Trigger info not found",
          description: "Trigger info not found",
          possibleFix: "Pass a check if trigger exists",
        });
      }
      return { config: triggerInfo.config } as TriggerSingleConfig;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves information about a single trigger.
   *
   * @param {TriggerSingleParam} data The data for the request.
   * @returns {Promise<SingleTriggerRes>} A promise that resolves to the trigger information.
   * @throws {ComposioError} If the request fails.
   */
  async getTriggerInfo(data: TriggerSingleParam): Promise<SingleTriggerRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getTriggerInfo",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZSingleTriggerParam.parse(data);
      const res = await apiClient.triggers.getTriggerInfoV2({
        client: this.client,
        path: {
          triggerName: parsedData.triggerName || parsedData.triggerId || "",
        },
      });

      // Bad type inference
      const trigger = res.data as unknown as SingleTriggerRes;
      if (!trigger) {
        throw CEG.getCustomError(COMPOSIO_SDK_ERROR_CODES.BACKEND.NOT_FOUND, {
          message: "Trigger info not found",
          description: "Trigger info not found",
          possibleFix: "Pass a check if trigger exists",
        });
      }
      return trigger;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Setup a trigger for a connected account.
   *
   * @param {SetupTriggerData} data The data for the request.
   * @returns {Promise<SetupTriggerResponse>} A promise that resolves to the setup trigger response.
   * @throws {ComposioError} If the request fails.
   */
  async setup(params: TriggerSetupParam): Promise<TriggerSetupResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "setup",
      file: this.fileName,
      params: params,
    });
    try {
      const parsedData = ZTriggerSetupParam.parse(params);
      const response = await apiClient.triggers.enableTrigger({
        client: this.client,
        path: {
          connectedAccountId: parsedData.connectedAccountId,
          triggerName: parsedData.triggerName,
        },
        body: {
          triggerConfig: parsedData.config || {},
        },
        throwOnError: true,
      });
      const { triggerId, status } = response.data;
      return {
        triggerId: triggerId!,
        triggerName: parsedData.triggerName,
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
   * @param {triggerId,triggerInstanceId} data The data for the request.
   * @returns {Promise<boolean>} A promise that resolves to the response of the enable request.
   * @throws {ComposioError} If the request fails.
   */
  async enable(data: SingleInstanceTriggerParam) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "enable",
      file: this.fileName,
      params: { data },
    });
    try {
      const finalTriggerId = data.triggerId || data.triggerInstanceId;
      if (!finalTriggerId) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
          {
            message: "Trigger ID is required",
            description: "Trigger ID is required",
            possibleFix: "Pass either triggerId or triggerInstanceId",
          }
        );
      }
      await apiClient.triggers.switchTriggerInstanceStatus({
        client: this.client,
        path: {
          triggerId: finalTriggerId!,
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
   * @param {triggerId,triggerInstanceId} data The data for the request.
   * @returns {Promise<boolean>} A promise that resolves to the response of the disable request.
   * @throws {ComposioError} If the request fails.
   */
  async disable(data: SingleInstanceTriggerParam) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "disable",
      file: this.fileName,
      params: { data },
    });
    try {
      const finalTriggerId = data.triggerId || data.triggerInstanceId;
      if (!finalTriggerId) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
          {
            message: "Trigger ID is required",
            description: "Trigger ID is required",
            possibleFix: "Pass either triggerId or triggerInstanceId",
          }
        );
      }
      await apiClient.triggers.switchTriggerInstanceStatus({
        client: this.client,
        path: {
          triggerId: finalTriggerId!,
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
   * @param {TriggerInstanceItems} data The data for the request.
   * @returns {Promise<boolean>} A promise that resolves to the response of the delete request.
   * @throws {ComposioError} If the request fails.
   */
  async delete(data: TriggerInstanceItems) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZTriggerInstanceItems.parse(data);
      await apiClient.triggers.deleteTrigger({
        client: this.client,
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
    filters: TriggerSubscribeParam = {}
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
