import { z } from "zod";
import {
  DeleteRowAPIDTO,
  ExpectedInputFieldsDTO,
  GetConnectorInfoResDTO,
  GetConnectorListResDTO,
} from "../client";
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
export type IntegrationListParam = z.infer<typeof ZListIntegrationsParams>;
export type IntegrationGetParam = z.infer<typeof ZSingleIntegrationParams>;
export type IntegrationListData = string;
type IntegrationCreateParams = z.infer<typeof ZCreateIntegrationParams>;

// API response types
export type IntegrationCreateData = {
  requestBody?: IntegrationCreateParams;
};

export type IntegrationListRes = GetConnectorListResDTO;
export type IntegrationGetRes = GetConnectorInfoResDTO;
export type IntegrationRequiredParamsRes = ExpectedInputFieldsDTO[];
export type IntegrationDeleteRes = DeleteRowAPIDTO;
export class Integrations {
  private backendClient: BackendClient;
  private fileName: string = "js/src/sdk/models/integrations.ts";

  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
  }

  /**
   * Retrieves a list of all available integrations in the Composio platform.
   *
   * This method allows clients to explore and discover the supported integrations. It returns an array of integration objects, each containing essential details such as the integration's key, name, description, logo, categories, and unique identifier.
   *
   * @returns {Promise<IntegrationListRes>} A promise that resolves to the list of all integrations.
   * @throws {ComposioError} If the request fails.
   */
  async list(data: IntegrationListParam = {}): Promise<IntegrationListRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.appConnector.listAllConnectors({
        query: data,
        throwOnError: true,
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
   * @param {IntegrationGetParam} data The data for the request.
   * @returns {Promise<IntegrationGetResponse>} A promise that resolves to the details of the integration.
   * @throws {ComposioError} If the request fails.
   */
  async get(data: IntegrationGetParam): Promise<IntegrationGetRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.appConnector.getConnectorInfo({
        path: data,
        throwOnError: true,
      });
      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves the required parameters for a specific integration's authentication scheme.
   *
   * This method is used to get the necessary input fields for a specific integration's authentication scheme.
   *
   * @param {IntegrationListData} data The data for the request.
   * @returns {Promise<IntegrationRequiredParamsRes>} A promise that resolves to the required parameters for the integration's authentication scheme.
   * @throws {ComposioError} If the request fails.
   */
  async getRequiredParams(
    integrationId: IntegrationListData
  ): Promise<IntegrationRequiredParamsRes> {
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
   * @param {IntegrationCreateParams} data The data for the request.
   * @returns {Promise<IntegrationGetResponse>} A promise that resolves to the created integration model.
   * @throws {ComposioError} If the request fails.
   */
  async create(data: IntegrationCreateParams): Promise<IntegrationGetRes> {
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

  /**
   * Deletes an existing integration in the Composio platform.
   *
   * This method allows clients to delete an existing integration by providing its integration ID.
   *
   * @param {IntegrationListData} data The data for the request.
   * @returns {Promise<IntegrationDeleteResponse>} A promise that resolves to the deleted integration model.
   * @throws {ComposioError} If the request fails.
   */
  async delete(
    integrationId: IntegrationListData
  ): Promise<IntegrationDeleteRes> {
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
        throwOnError: true,
      });
      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
