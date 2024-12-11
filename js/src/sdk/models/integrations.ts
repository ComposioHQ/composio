import {
  DeleteConnectorData,
  GetConnectorInfoData,
  GetConnectorInfoResDTO,
  GetConnectorListResDTO,
} from "../client";
import apiClient from "../client/client";
import { BackendClient } from "./backendClient";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

export type ListAllIntegrationsData = {
  /**
   * Page number to fetch
   */
  page?: number;
  /**
   * Page Size to assume
   */
  pageSize?: number;
  /**
   * The name of the app to filter by
   */
  appName?: string;
  /**
   * Whether to show disabled integrations
   */
  showDisabled?: boolean;
};

export type GetIntegrationData = {
  /**
   * The unique identifier of the integration.
   */
  integrationId: string;
};

export type CreateIntegrationData = {
  requestBody?: {
    /**
     * The name of the connector.
     */
    name?: string;
    /**
     * The authentication scheme used by the connector (e.g., "OAUTH2", "API_KEY").
     */
    authScheme?: string;
    /**
     * The unique identifier of the app associated with the connector.
     */
    appId?: string;
    forceNewIntegration?: boolean;
    /**
     * An object containing the authentication configuration for the connector.
     */
    authConfig?: {
      /**
       * The client ID used for authentication with the app - if authScheme is OAUTH2
       */
      client_id?: string;
      /**
       * The client secret used for authentication with the app - if authScheme is OAUTH2
       */
      client_secret?: string;
      /**
       * The API key used for authentication with the app - if authScheme is API_KEY
       */
      api_key?: string;
      /**
       * The Consumer key used for authentication with the app - if authScheme is OAUTH1
       */
      consumer_key?: string;
      /**
       * The Consumer secret used for authentication with the app - if authScheme is OAUTH1
       */
      consumer_secret?: string;
      /**
       *  The base URL for making API requests to the app.
       */
      base_url?: string;

      [key: string]: unknown;
    };
    /**
     * Use default Composio credentials to proceed. The developer app credentials will be of Composio.
     */
    useComposioAuth?: boolean;
  };
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

  async getRequiredParams(integrationId: string) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getRequiredParams",
      file: this.fileName,
      params: { integrationId },
    });
    try {
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
   * @param {CreateIntegrationData["requestBody"]} data The data for the request.
   * @returns {Promise<CreateIntegrationResponse>} A promise that resolves to the created integration model.
   * @throws {ApiError} If the request fails.
   */
  async create(data: CreateIntegrationData["requestBody"]) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "create",
      file: this.fileName,
      params: { data },
    });
    try {
      if (!data?.authConfig) {
        data!.authConfig = {};
      }

      const response = await apiClient.appConnector.createConnector({
        body: {
          name: data?.name!,
          appId: data?.appId!,
          authConfig: data?.authConfig! as any,
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

  async delete(data: DeleteConnectorData) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.appConnector.deleteConnector(data);
      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
