import { AppListResDTO, SingleAppInfoResDTO } from "../client";
import apiClient from "../client/client";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

import { BackendClient } from "./backendClient";

export type GetAppData = {
  appKey: string;
};

export type GetAppResponse = SingleAppInfoResDTO;

export type ListAllAppsResponse = AppListResDTO;

export type RequiredParamsResponse = {
  required_fields: string[];
  expected_from_user: string[];
  optional_fields: string[];
};

export type RequiredParamsFullResponse = {
  availableAuthSchemes: string[];
  authSchemes: Record<string, RequiredParamsResponse>;
};

export class Apps {
  backendClient: BackendClient;
  fileName: string = "js/src/sdk/models/apps.ts";
  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
  }

  /**
   * Retrieves a list of all available apps in the Composio platform.
   *
   * This method allows clients to explore and discover the supported apps. It returns an array of app objects, each containing essential details such as the app's key, name, description, logo, categories, and unique identifier.
   *
   * @returns {Promise<AppListResDTO>} A promise that resolves to the list of all apps.
   * @throws {ApiError} If the request fails.
   */
  async list() {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: {},
    });
    try {
      const { data } = await apiClient.apps.getApps();
      return data?.items || [];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves details of a specific app in the Composio platform.
   *
   * This method allows clients to fetch detailed information about a specific app by providing its unique key. The response includes the app's name, key, status, description, logo, categories, authentication schemes, and other metadata.
   *
   * @param {GetAppData} data The data for the request, including the app's unique key.
   * @returns {CancelablePromise<GetAppResponse>} A promise that resolves to the details of the app.
   * @throws {ApiError} If the request fails.
   */
  async get(data: GetAppData) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      const { data: response } = await apiClient.apps.getApp({
        path: {
          appName: data.appKey,
        },
      });
      if (!response) throw new Error("App not found");
      return response;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async getRequiredParams(appId: string): Promise<RequiredParamsFullResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getRequiredParams",
      file: this.fileName,
      params: { appId },
    });
    try {
      const appData = await this.get({ appKey: appId });
      if (!appData) throw new Error("App not found");
      const authSchemes = appData.auth_schemes;
      const availableAuthSchemes = (
        authSchemes as Array<{ mode: string }>
      )?.map((scheme) => scheme?.mode);

      const authSchemesObject: Record<string, RequiredParamsResponse> = {};

      for (const scheme of authSchemes as Array<{
        mode: string;
        fields: Array<{
          name: string;
          required: boolean;
          expected_from_customer: boolean;
        }>;
      }>) {
        const name = scheme.mode;
        authSchemesObject[name] = {
          required_fields: [],
          optional_fields: [],
          expected_from_user: [],
        };

        scheme.fields.forEach((field) => {
          const isExpectedForIntegrationSetup =
            field.expected_from_customer === false;
          const isRequired = field.required;

          if (isExpectedForIntegrationSetup) {
            if (isRequired) {
              authSchemesObject[name].expected_from_user.push(field.name);
            } else {
              authSchemesObject[name].optional_fields.push(field.name);
            }
          } else {
            authSchemesObject[name].required_fields.push(field.name);
          }
        });
      }

      return {
        availableAuthSchemes,
        authSchemes: authSchemesObject,
      };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async getRequiredParamsForAuthScheme({
    appId,
    authScheme,
  }: {
    appId: string;
    authScheme: string;
  }): Promise<RequiredParamsResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getRequiredParamsForAuthScheme",
      file: this.fileName,
      params: { appId, authScheme },
    });
    try {
      const params = await this.getRequiredParams(appId);
      return params.authSchemes[authScheme];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
