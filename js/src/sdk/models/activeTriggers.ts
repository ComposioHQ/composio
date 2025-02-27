import { Client } from "@hey-api/client-axios";
import { z } from "zod";
import apiClient from "../client/client";
import {
  ZActiveTriggerItemRes,
  ZActiveTriggersQuery,
  ZTriggerItemParam,
} from "../types/activeTrigger";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { AxiosBackendClient } from "./backendClient";

export type TriggerItemParam = z.infer<typeof ZTriggerItemParam>;
export type GetActiveTriggersData = z.infer<typeof ZActiveTriggersQuery>;
export type TriggerItemRes = z.infer<typeof ZActiveTriggerItemRes>;
export type TriggerChangeResponse = { status: string };
export class ActiveTriggers {
  // Remove this as we might not need it
  private backendClient: AxiosBackendClient;
  private client: Client;
  private fileName: string = "js/src/sdk/models/activeTriggers.ts";
  constructor(backendClient: AxiosBackendClient, client: Client) {
    this.backendClient = backendClient;
    this.client = client;
  }

  /** Missing type */
  /**
   * Retrieves details of a specific active trigger in the Composio platform by providing its trigger name.
   *
   * The response includes the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {TriggerItemParam} data The data for the request.
   * @returns {Promise<TriggerItemRes>} A promise that resolves to the details of the active trigger.
   * @throws {ComposioError} If the request fails.
   */
  async get({ triggerId }: TriggerItemParam) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { triggerId },
    });
    try {
      const parsedData = ZTriggerItemParam.parse({ triggerId });
      const { data } = await apiClient.triggers.getActiveTriggers({
        client: this.client,
        query: {
          triggerIds: `${parsedData.triggerId}`,
        },
      });

      return data?.triggers?.[0] as unknown as TriggerItemRes;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves a list of all active triggers in the Composio platform.
   *
   * This method allows you to fetch a list of all the available active triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {GetActiveTriggersData} data The data for the request.
   * @returns {Promise<ZActiveTriggerItemRes[]>} A promise that resolves to the list of all active triggers.
   * @throws {ComposioError} If the request fails.
   */
  async list(data: GetActiveTriggersData = {}): Promise<TriggerItemRes[]> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZActiveTriggersQuery.parse(data);
      const { data: response } = await apiClient.triggers.getActiveTriggers({
        client: this.client,
        query: parsedData,
      });

      return response?.triggers as unknown as TriggerItemRes[];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Enables the previously disabled trigger.
   *
   * @param {TriggerItemParam} data The data for the request.
   * @returns {Promise<{status: string}>} A promise that resolves to the response of the enable request.
   * @throws {ComposioError} If the request fails.
   */
  async enable(data: TriggerItemParam): Promise<{ status: string }> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "enable",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZTriggerItemParam.parse(data);
      await apiClient.triggers.switchTriggerInstanceStatus({
        client: this.client,
        path: { triggerId: parsedData.triggerId },
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
   * Disables the previously enabled trigger.
   *
   * @param {TriggerItemParam} data The data for the request.
   * @returns {Promise<{status: string}>} A promise that resolves to the response of the disable request.
   */
  async disable(data: TriggerItemParam): Promise<TriggerChangeResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "disable",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZTriggerItemParam.parse(data);
      await apiClient.triggers.switchTriggerInstanceStatus({
        client: this.client,
        path: parsedData,
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
}
