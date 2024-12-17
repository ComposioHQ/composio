import {
  InitiateConnectionPayloadDto,
  GetConnectionsResponseDto,
  GetConnectionInfoData,
  GetConnectionInfoResponse,
  GetConnectionsData,
  InitiateConnectionResponse2,
} from "../client";
import client from "../client/client";
import apiClient from "../client/client";
import { BackendClient } from "./backendClient";
import { Integrations } from "./integrations";
import { Apps } from "./apps";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";

type ConnectedAccountsListData = GetConnectionsData["query"] & {
  appNames?: string;
};

type InitiateConnectionDataReq = InitiateConnectionPayloadDto & {
  data?: Record<string, unknown> | unknown;
  entityId?: string;
  labels?: string[];
  integrationId?: string;
  redirectUri?: string;
  authMode?: string;
  authConfig?: { [key: string]: any };
  appName?: string;
};

export class ConnectedAccounts {
  backendClient: BackendClient;
  integrations: Integrations;
  apps: Apps;
  fileName: string = "js/src/sdk/models/connectedAccounts.ts";

  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
    this.integrations = new Integrations(this.backendClient);
    this.apps = new Apps(this.backendClient);
  }

  async list(
    data: ConnectedAccountsListData
  ): Promise<GetConnectionsResponseDto> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const res = await apiClient.connections.getConnections({ query: data });
      return res.data!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async create(data: InitiateConnectionPayloadDto) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "create",
      file: this.fileName,
      params: { data },
    });
    try {
      const { data: res } = (await apiClient.connections.initiateConnection({
        body: data,
      })) as { data: InitiateConnectionResponse2 };

      return new ConnectionRequest({
        connectionStatus: res.connectionStatus,
        connectedAccountId: res.connectedAccountId,
        redirectUri: res.redirectUrl ?? null,
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async get(data: { connectedAccountId: string }) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      const res = await apiClient.connections.getConnection({ path: data });
      return res.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async delete(data: { connectedAccountId: string }) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      const res = await apiClient.connections.deleteConnection({ path: data });
      return res.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async getAuthParams(data: { connectedAccountId: string }) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getAuthParams",
      file: this.fileName,
      params: { data },
    });
    try {
      const res = await apiClient.connections.getConnection({
        path: { connectedAccountId: data.connectedAccountId },
      });
      return res.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async initiate(
    payload: InitiateConnectionDataReq
  ): Promise<ConnectionRequest> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "initiate",
      file: this.fileName,
      params: { payload },
    });
    try {
      let {
        integrationId,
        entityId = "default",
        labels,
        data = {},
        redirectUri,
        authMode,
        authConfig,
        appName,
      } = payload;

      if (!integrationId && authMode) {
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

        if (!appName)
          throw new Error(
            "appName is required when integrationId is not provided"
          );
        if (!authMode)
          throw new Error(
            "authMode is required when integrationId is not provided"
          );
        if (!authConfig)
          throw new Error(
            "authConfig is required when integrationId is not provided"
          );

        const app = await this.apps.get({ appKey: appName });
        const integration = await this.integrations.create({
          appId: app.appId!,
          name: `integration_${timestamp}`,
          authScheme: authMode,
          authConfig: authConfig,
          useComposioAuth: false,
        });
        integrationId = integration?.id!;
      }

      const res = await client.connections
        .initiateConnection({
          body: {
            integrationId,
            entityId,
            labels,
            redirectUri,
            data,
          },
        })
        .then((res) => res.data);

      return new ConnectionRequest({
        connectionStatus: res?.connectionStatus!,
        connectedAccountId: res?.connectedAccountId!,
        redirectUri: res?.redirectUrl!,
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}

export class ConnectionRequest {
  connectionStatus: string;
  connectedAccountId: string;
  redirectUrl: string | null;

  constructor({
    connectionStatus,
    connectedAccountId,
    redirectUri,
  }: {
    connectionStatus: string;
    connectedAccountId: string;
    redirectUri: string | null;
  }) {
    this.connectionStatus = connectionStatus;
    this.connectedAccountId = connectedAccountId;
    this.redirectUrl = redirectUri;
  }

  async saveUserAccessData(data: {
    fieldInputs: Record<string, string>;
    redirectUrl?: string;
    entityId?: string;
  }) {
    try {
      const { data: connectedAccount } =
        await apiClient.connections.getConnection({
          path: { connectedAccountId: this.connectedAccountId },
        });
      if (!connectedAccount) throw new Error("Connected account not found");
      return await apiClient.connections.initiateConnection({
        body: {
          integrationId: connectedAccount.integrationId,
          //@ts-ignore
          data: data.fieldInputs,
          redirectUri: data.redirectUrl,
          userUuid: data.entityId,
          entityId: data.entityId,
        },
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async getAuthInfo(
    data: GetConnectionInfoData["path"]
  ): Promise<GetConnectionInfoResponse> {
    try {
      const res = await client.connections.getConnectionInfo({ path: data });
      return res.data!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async waitUntilActive(timeout = 60) {
    try {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout * 1000) {
        const connection = await apiClient.connections
          .getConnection({
            path: { connectedAccountId: this.connectedAccountId },
          })
          .then((res) => res.data);
        if (!connection) throw new Error("Connected account not found");
        if (connection.status === "ACTIVE") {
          return connection;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error(
        "Connection did not become active within the timeout period."
      );
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
