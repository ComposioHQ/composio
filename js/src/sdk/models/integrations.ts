import { z } from "zod";

import { Client } from "@hey-api/client-axios";
import {
  DeleteRowAPIDTO,
  ExpectedInputFieldsDTO,
  GetConnectorInfoResDTO,
  GetConnectorListResDTO,
} from "../client";
import apiClient from "../client/client";
import {
  ZAuthMode,
  ZCreateIntegrationParams,
  ZListIntegrationsParams,
  ZSingleIntegrationParams,
} from "../types/integration";
import { CEG } from "../utils/error";
import { COMPOSIO_SDK_ERROR_CODES } from "../utils/errors/src/constants";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { AxiosBackendClient } from "./backendClient";

// Types generated from zod schemas

export type IntegrationGetRequiredParam = z.infer<
  typeof ZSingleIntegrationParams
>;
export type IntegrationCreateParams = z.infer<
  typeof ZCreateIntegrationParams
> & {
  /** @deprecated use appUniqueKey field instead */
  appId?: string;
};
export type IntegrationListParam = z.infer<typeof ZListIntegrationsParams> & {
  /** @deprecated use appUniqueKeys field instead */
  appName?: string;
};
type IntegrationDeleteParam = z.infer<typeof ZSingleIntegrationParams>;

// API response types
export type IntegrationCreateData = {
  requestBody?: IntegrationCreateParams;
};

export type IntegrationListRes = GetConnectorListResDTO;
export type IntegrationGetRes = GetConnectorInfoResDTO;
export type IntegrationRequiredParamsRes = ExpectedInputFieldsDTO[];
export type IntegrationDeleteRes = DeleteRowAPIDTO;

export class Integrations {
  private backendClient: AxiosBackendClient;
  private fileName: string = "js/src/sdk/models/integrations.ts";
  private client: Client;

  constructor(backendClient: AxiosBackendClient, client: Client) {
    this.backendClient = backendClient;
    this.client = client;
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
      const { appName, appUniqueKey, ...rest } =
        ZListIntegrationsParams.parse(data);
      const finalAppName =
        appName && appName.length > 0 ? appName : appUniqueKey;
      const response = await apiClient.appConnector.listAllConnectors({
        client: this.client,
        query: { ...rest, appName: finalAppName },
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
  async get(data: IntegrationGetRequiredParam): Promise<IntegrationGetRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      const response = await apiClient.appConnector.getConnectorInfo({
        client: this.client,
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
   * @param {IntegrationGetParam} data The data for the request.
   * @returns {Promise<IntegrationRequiredParamsRes>} A promise that resolves to the required parameters for the integration's authentication scheme.
   * @throws {ComposioError} If the request fails.
   */
  async getRequiredParams(
    data: IntegrationGetRequiredParam
  ): Promise<IntegrationRequiredParamsRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getRequiredParams",
      file: this.fileName,
      params: { data },
    });
    try {
      ZSingleIntegrationParams.parse(data);
      const response = await apiClient.appConnector.getConnectorInfo({
        client: this.client,
        path: {
          integrationId: data.integrationId,
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
      ZCreateIntegrationParams.parse(data);

      let uniqueKey = data.appUniqueKey;

      if (!uniqueKey) {
        const apps = await apiClient.apps.getApps({ client: this.client });
        const app = apps.data?.items.find((app) => app.appId === data.appId);
        uniqueKey = app!.key;
        if (!uniqueKey) {
          throw CEG.getCustomError(
            COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
            {
              message: `No app was found with the provided appId`,
              description: `Please provide an app unique key`,
            }
          );
        }
      }

      const response = await apiClient.appConnectorV2.createConnectorV2({
        client: this.client,
        body: {
          app: {
            uniqueKey: uniqueKey,
          },
          config: {
            useComposioAuth: data.useComposioAuth,
            name: data.name,
            authScheme: data.authScheme as z.infer<typeof ZAuthMode>,
            integrationSecrets: data.authConfig,
          },
        },
        throwOnError: true,
      });

      const integrationId = response.data.integrationId;
      return this.get({ integrationId });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async getOrCreateIntegration(
    data: IntegrationCreateParams
  ): Promise<IntegrationGetRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getOrCreateIntegration",
      file: this.fileName,
      params: { data },
    });

    try {
      ZCreateIntegrationParams.parse(data);

      let uniqueKey = data.appUniqueKey;

      if (!uniqueKey) {
        const apps = await apiClient.apps.getApps({ client: this.client });
        const app = apps.data?.items.find((app) => app.appId === data.appId);
        uniqueKey = app!.key;
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
          {
            message: `No app was found with the provided appId`,
            description: `Please provide an app unique key`,
          }
        );
      }

      const response = await apiClient.appConnectorV2.getOrCreateConnector({
        client: this.client,
        body: {
          app: {
            uniqueKey,
          },
          config: {
            useComposioAuth: data.useComposioAuth,
            name: data.name,
            authScheme: data.authScheme as z.infer<typeof ZAuthMode>,
            integrationSecrets: data.authConfig,
          },
        },
        throwOnError: true,
      });

      const integrationId = response.data.integrationId;
      return this.get({ integrationId });
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
  async delete(data: IntegrationDeleteParam): Promise<IntegrationDeleteRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      ZSingleIntegrationParams.parse(data);
      const response = await apiClient.appConnector.deleteConnector({
        client: this.client,
        path: {
          integrationId: data.integrationId,
        },
        throwOnError: true,
      });
      return response.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
