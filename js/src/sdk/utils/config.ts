import {
  COMPOSIO_DIR,
  DEFAULT_BASE_URL,
  USER_DATA_FILE_NAME,
} from "./constants";

import {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { getUUID } from "../../utils/common";
import logger from "../../utils/logger";
import { getEnvVariable } from "../../utils/shared";
import apiClient from "../client/client";
import { client as axiosClient } from "../client/services.gen";

declare module "axios" {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      responseTime?: number;
      responseSize?: number;
      startTime?: number;
      requestId?: string;
    };
  }
}

// File path helpers
export const userDataPath = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os");
    return path.join(os.homedir(), COMPOSIO_DIR, USER_DATA_FILE_NAME);
  } catch (_error) {
    return null;
  }
};

export const getUserDataJson = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const data = fs.readFileSync(userDataPath(), "utf8");
    return JSON.parse(data);
  } catch (_error) {
    return {};
  }
};

// Axios configuration
export const setAxiosClientConfig = (axiosClientInstance: AxiosInstance) => {
  axiosClientInstance.interceptors.request.use(
    (request: InternalAxiosRequestConfig) => {
      const body = request.data ? JSON.stringify(request.data) : "";
      // set x-request-id header
      const requestId = getUUID();
      request.headers["x-request-id"] = requestId;
      request.metadata = {
        startTime: Date.now(),
        requestId,
      };
      logger.debug(
        `API Req [${request.method?.toUpperCase()}] ${request.url}, x-request-id: ${requestId}`,
        {
          ...(body && { body }),
          query: request.params,
        }
      );
      return request;
    }
  );

  axiosClientInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      const method = response.config.method?.toUpperCase();
      const responseSize = Math.round(
        JSON.stringify(response.data).length / 1024
      );
      const requestStartTime = (response.config as InternalAxiosRequestConfig)
        .metadata?.startTime;
      const responseTime = requestStartTime ? Date.now() - requestStartTime : 0;
      const status = response.status;
      const requestId =
        response.headers["x-request-id"] ||
        (response.config as InternalAxiosRequestConfig).metadata?.requestId;

      // @ts-expect-error Error with metadata type
      response["metadata"] = {
        responseTime,
        responseSize,
        requestId,
      };
      logger.debug(
        `API Res [${method}] ${response.config.url} - ${status} - ${responseSize} KB ${responseTime}ms`
      );
      return response;
    },
    (error: AxiosError<unknown>) => {
      const requestStartTime = (error.config as InternalAxiosRequestConfig)
        ?.metadata?.startTime;
      const requestStartTimeId = (error.config as InternalAxiosRequestConfig)
        ?.metadata?.requestId;
      const responseTime = requestStartTime ? Date.now() - requestStartTime : 0;
      const status = error.response?.status || "Unknown";
      const length = JSON.stringify(error.response?.data)?.length || 0;
      const responseSize = Math.round(length / 1024);
      const requestId =
        error.response?.headers?.["x-request-id"] || requestStartTimeId;

      const metadata = {
        responseTime,
        responseSize,
        requestId,
      };
      // @ts-expect-error Error with metadata type
      error.metadata = metadata;

      logger.debug(
        `API Error [${status}] ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${status} - ${responseTime}ms, x-request-id: ${requestId}`,
        {
          headers: error.response?.headers,
          data: error.response?.data,
          error: error.message,
          responseTime,
        }
      );
      return Promise.reject(error);
    }
  );
};

// Client configuration functions
export function getSDKConfig(baseUrl?: string, apiKey?: string) {
  const userData = getUserDataJson();
  const { api_key: apiKeyFromUserConfig, base_url: baseURLFromUserConfig } =
    userData;

  const baseURLParsed =
    baseUrl ||
    getEnvVariable("COMPOSIO_BASE_URL") ||
    baseURLFromUserConfig ||
    DEFAULT_BASE_URL;
  const apiKeyParsed =
    apiKey || getEnvVariable("COMPOSIO_API_KEY") || apiKeyFromUserConfig || "";

  return { baseURL: baseURLParsed, apiKey: apiKeyParsed };
}

// Get the API client
export function getOpenAPIClient(baseUrl?: string, apiKey?: string) {
  const { baseURL, apiKey: apiKeyParsed } = getSDKConfig(baseUrl, apiKey);

  axiosClient.setConfig({
    baseURL,
    headers: {
      "X-API-KEY": apiKeyParsed,
      "X-SOURCE": "js_sdk",
      "X-RUNTIME": "js_sdk",
    },
    throwOnError: true,
  });

  setAxiosClientConfig(axiosClient.instance);
  return apiClient;
}
