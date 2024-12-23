import { z } from "zod";
import apiClient from "../client/client";
import {
  ZCreateIntegrationParams,
  ZListIntegrationsParams,
  ZSingleIntegrationParams,
} from "../types/integration";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { BackendClient } from "./backendClient";

// Types generated from zod schemas
export type ListAllIntegrationsData = z.infer<typeof ZListIntegrationsParams>;
export type GetIntegrationData = z.infer<typeof ZSingleIntegrationParams>;
export type SingleIntegrationData = z.infer<typeof ZSingleIntegrationParams>;
type CreateIntegrationParams = z.infer<typeof ZCreateIntegrationParams>;

export type CreateIntegrationData = {
  requestBody?: CreateIntegrationParams;
};

export class Integrations {
  backendClient: BackendClient;
  fileName: string = "js/src/sdk/models/integrations.ts";

  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
  }

  /**
   * Retrieves a list of all available integrations in the Composio platform.
   *
   * This method allows clients to explore and discover the supported integrations. It returns an array of integration objects, each containing essential details such as the integration's key, name, description, logo, categories, and unique identifier.
   *
   * @returns {Promise<ListAllIntegrationsResponse>} A promise that resolves to the list of all integrations.
   * @throws {ApiError} If the request fails.
   */
  async list(data: ListAllIntegrationsData = {}) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.appConnector.listAllConnectors({
        query: data,
      });

      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves details of a specific integration in the Composio platform by providing its integration name.
   *
   * The response includes the integration's name, display name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {GetIntegrationData} data The data for the request.
   * @returns {Promise<AppConnectorControllerGetConnectorInfoResponse | undefined>} A promise that resolves to the details of the integration.
   * @throws {ApiError} If the request fails.
   */
  async get(data: GetIntegrationData) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.appConnector.getConnectorInfo({
        path: data,
      });
      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async getRequiredParams({ integrationId }: SingleIntegrationData) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getRequiredParams",
      file: this.fileName,
      params: { integrationId },
    });
    try {
      ZSingleIntegrationParams.parse({
        integrationId,
      });
      const response = await apiClient.appConnector.getConnectorInfo({
        path: {
          integrationId,
        },
        throwOnError: true,
      });
      return response.data?.expectedInputFields;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Creates a new integration in the Composio platform.
   *
   * This method allows clients to create a new integration by providing the necessary details such as app ID, name, authentication mode, and configuration.
   *
   * @param CreateIntegrationParams data The data for the request.
   * @returns {Promise<CreateIntegrationResponse>} A promise that resolves to the created integration model.
   * @throws {ApiError} If the request fails.
   */
  async create(data: CreateIntegrationParams) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "create",
      file: this.fileName,
      params: { data },
    });
    try {
      if (!data?.authConfig) {
        data!.authConfig = {};
      }
      ZCreateIntegrationParams.parse(data);

      const response = await apiClient.appConnector.createConnector({
        body: {
          name: data?.name!,
          appId: data?.appId!,
          authConfig: data?.authConfig! as Record<string, unknown>,
          authScheme: data?.authScheme,
          useComposioAuth: data?.useComposioAuth!,
          forceNewIntegration: true,
        },
        throwOnError: true,
      });
      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async delete({ integrationId }: SingleIntegrationData) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { integrationId },
    });
    try {
      ZSingleIntegrationParams.parse({
        integrationId,
      });
      const response = await apiClient.appConnector.deleteConnector({
        path: {
          integrationId,
        },
      });
      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
