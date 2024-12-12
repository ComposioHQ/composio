import { GetActiveTriggersData } from "../client/types.gen";
import apiClient from "../client/client";
import { BackendClient } from "./backendClient";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

type TActiveTrigger = {
  id: string;
  connectionId: string;
  triggerName: string;
  triggerData: string;
  triggerConfig: Record<string, any>;
  state: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  disabledReason: string | null;
};

export class ActiveTriggers {
  backendClient: BackendClient;
  fileName: string = "js/src/sdk/models/activeTriggers.ts";
  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
  }
  /**
   * Retrieves details of a specific active trigger in the Composio platform by providing its trigger name.
   *
   * The response includes the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {GetActiveTriggerData} data The data for the request.
   * @returns {CancelablePromise<GetActiveTriggerResponse>} A promise that resolves to the details of the active trigger.
   * @throws {ApiError} If the request fails.
   */
  async get({ triggerId }: { triggerId: string }) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { triggerId },
    });
    try {
      const { data } = await apiClient.triggers.getActiveTriggers({
        query: {
          triggerIds: `${triggerId}`,
        },
      });
      return data?.triggers[0];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves a list of all active triggers in the Composio platform.
   *
   * This method allows you to fetch a list of all the available active triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {ListActiveTriggersData} data The data for the request.
   * @returns {CancelablePromise<ListActiveTriggersResponse>} A promise that resolves to the list of all active triggers.
   * @throws {ApiError} If the request fails.
   */
  async list(data: GetActiveTriggersData = {}) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const { data: response } = await apiClient.triggers.getActiveTriggers({
        query: data,
      });

      return response?.triggers || [];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Enables the previously disabled trigger.
   *
   * @param {Object} data The data for the request.
   * @param {string} data.triggerId Id of the trigger
   * @returns {CancelablePromise<Record<string, any>>} A promise that resolves to the response of the enable request.
   * @throws {ApiError} If the request fails.
   */
  async enable(data: { triggerId: string }): Promise<boolean> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "enable",
      file: this.fileName,
      params: { data },
    });
    try {
      await apiClient.triggers.switchTriggerInstanceStatus({
        path: data,
        body: {
          enabled: true,
        },
      });
      return true;
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
      await apiClient.triggers.switchTriggerInstanceStatus({
        path: data,
        body: {
          enabled: false,
        },
      });
      return true;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
