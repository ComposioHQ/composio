import {
  AppInfoResponseDto,
  AppListResDTO,
  SingleAppInfoResDTO,
} from "../client";
import apiClient from "../client/client";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

import { Client } from "@hey-api/client-axios";
import { z } from "zod";
import {
  ZGetAppParams,
  ZGetRequiredParams,
  ZGetRequiredParamsForAuthScheme,
  ZRequiredParamsFullResponse,
  ZRequiredParamsResponse,
} from "../types/app";
import { AxiosBackendClient } from "./backendClient";

// schema types generated from zod
export type AppGetRequiredParams = z.infer<typeof ZGetRequiredParams>;
export type AppGetRequiredParamsForAuthSchemeParam = z.infer<
  typeof ZGetRequiredParamsForAuthScheme
> & {
  appName?: string;
  /**
   * @deprecated use appName instead
   */
  appId?: string;
};
export type AppRequiredParamsFullResponse = z.infer<
  typeof ZRequiredParamsFullResponse
>;
export type AppRequiredParamsResponse = z.infer<typeof ZRequiredParamsResponse>;
export type AppGetDataParams = z.infer<typeof ZGetAppParams>;

// types generated from backend client
export type AppItemResponse = SingleAppInfoResDTO;
export type AppListResponse = AppItemListResponse[];
export type AppListRes = AppListResDTO;
export type AppItemListResponse = AppInfoResponseDto;

export class Apps {
  private backendClient: AxiosBackendClient;
  private client: Client;
  private fileName: string = "js/src/sdk/models/apps.ts";
  constructor(backendClient: AxiosBackendClient, client: Client) {
    this.backendClient = backendClient;
    this.client = client;
  }

  /**
   * Retrieves a list of all available apps in the Composio platform.
   *
   * This method allows clients to explore and discover the supported apps. It returns an array of app objects, each containing essential details such as the app's key, name, description, logo, categories, and unique identifier.
   *
   * @returns {Promise<AppItemListResponse[]>} A promise that resolves to the list of all apps.
   * @throws {ComposioError} If the request fails.
   */
  async list(): Promise<AppListResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: {},
    });
    try {
      const { data } = await apiClient.apps.getApps({
        client: this.client,
        query: {
          additionalFields: "auth_schemes",
        },
      });
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
   * @param {AppGetDataParams} data The data for the request, including the app's unique key.
   * @returns {Promise<AppItemResponse>} A promise that resolves to the details of the app.
   * @throws {ComposioError} If the request fails.
   */
  async get(data: AppGetDataParams): Promise<AppItemResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      const { data: response } = await apiClient.apps.getApp({
        client: this.client,
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

  /**
   * Retrieves the required parameters for a specific app in the Composio platform.
   *
   * This method allows clients to fetch the necessary parameters for a specific app by providing its unique key. The response includes the app's name, key, status, description, logo, categories, authentication schemes, and other metadata.
   *
   * @param {string} appId The unique key of the app.
   * @returns {Promise<AppRequiredParamsFullResponse>} A promise that resolves to the required parameters for the app.
   * @throws {ComposioError} If the request fails.
   */
  async getRequiredParams(
    appId: string
  ): Promise<AppRequiredParamsFullResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getRequiredParams",
      file: this.fileName,
      params: { appId },
    });
    try {
      ZGetRequiredParams.parse({ appId });
      const appData = await this.get({ appKey: appId });
      if (!appData) throw new Error("App not found");
      const authSchemes = appData.auth_schemes;
      const availableAuthSchemes = (
        authSchemes as Array<{ mode: string }>
      )?.map((scheme) => scheme?.mode);

      const authSchemesObject: Record<string, AppRequiredParamsResponse> = {};

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

  /**
   * Retrieves the required parameters for a specific authentication scheme of an app in the Composio platform.
   *
   * This method allows clients to fetch the necessary parameters for a specific authentication scheme of an app by providing its unique key and the authentication scheme.
   *
   * @param {AppGetRequiredParamsForAuthSchemeParam} data The data for the request, including the app's unique key and the authentication scheme.
   * @returns {Promise<AppRequiredParamsResponse>} A promise that resolves to the required parameters for the authentication scheme.
   * @throws {ComposioError} If the request fails.
   */
  async getRequiredParamsForAuthScheme({
    appId,
    appName,
    authScheme,
  }: AppGetRequiredParamsForAuthSchemeParam): Promise<AppRequiredParamsResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getRequiredParamsForAuthScheme",
      file: this.fileName,
      params: { appId, authScheme },
    });
    try {
      const finalAppId = appName || appId;
      ZGetRequiredParamsForAuthScheme.parse({ appId: finalAppId, authScheme });
      const params = await this.getRequiredParams(finalAppId);
      return params.authSchemes[authScheme];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
