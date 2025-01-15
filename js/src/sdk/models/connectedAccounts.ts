import { z } from "zod";
import {
  ConnectedAccountResponseDTO,
  ConnectionParams,
  DeleteRowAPIDTO,
  GetConnectionsResponseDto,
} from "../client";
import { default as apiClient } from "../client/client";
import {
  ZInitiateConnectionDataReq,
  ZInitiateConnectionPayloadDto,
  ZListConnectionsData,
  ZReinitiateConnectionPayloadDto,
  ZSaveUserAccessDataParam,
  ZSingleConnectionParams,
} from "../types/connectedAccount";
import { ZAuthMode } from "../types/integration";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { BackendClient } from "./backendClient";

// Schema type from conectedAccount.ts
type ConnectedAccountsListData = z.infer<typeof ZListConnectionsData>;
type InitiateConnectionDataReq = z.infer<typeof ZInitiateConnectionDataReq>;
type SingleConnectionParam = z.infer<typeof ZSingleConnectionParams>;
type SaveUserAccessDataParam = z.infer<typeof ZSaveUserAccessDataParam>;
type InitiateConnectionPayload = z.infer<typeof ZInitiateConnectionPayloadDto>;
type ReinitiateConnectionPayload = z.infer<
  typeof ZReinitiateConnectionPayloadDto
>;

export type ConnectedAccountListResponse = GetConnectionsResponseDto;
export type SingleConnectedAccountResponse = ConnectedAccountResponseDTO;
export type SingleDeleteResponse = DeleteRowAPIDTO;
export type ConnectionItem = ConnectionParams;

export class ConnectedAccounts {
  private backendClient: BackendClient;
  private fileName: string = "js/src/sdk/models/connectedAccounts.ts";

  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
  }

  async list(
    data: ConnectedAccountsListData
  ): Promise<ConnectedAccountListResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const res = await apiClient.connections.listConnections({ query: data });
      return res.data!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async create(data: InitiateConnectionPayload): Promise<ConnectionRequest> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "create",
      file: this.fileName,
      params: { data },
    });
    try {
      const { data: res } = await apiClient.connections.initiateConnection({
        body: data,
        throwOnError: true,
      });

      return new ConnectionRequest({
        connectionStatus: res.connectionStatus,
        connectedAccountId: res.connectedAccountId,
        redirectUri: res.redirectUrl ?? null,
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async get(
    data: SingleConnectionParam
  ): Promise<SingleConnectedAccountResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      ZSingleConnectionParams.parse(data);
      const res = await apiClient.connections.getConnection({
        path: data,
        throwOnError: true,
      });
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

  async delete(data: SingleConnectionParam): Promise<SingleDeleteResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      ZSingleConnectionParams.parse(data);
      const res = await apiClient.connections.deleteConnection({
        path: data,
        throwOnError: true,
      });
      return res.data!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  // Should we deprecate this or change the signature?
  async initiate(
    payload: InitiateConnectionDataReq
  ): Promise<ConnectionRequest> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "initiate",
      file: this.fileName,
      params: { payload },
    });
    try {
      const connection = await apiClient.connectionsV2.initiateConnectionV2({
        body: {
          app: {
            uniqueKey: payload.appName!,
            integrationId: payload.integrationId,
          },
          config: {
            name: payload.appName!,
            useComposioAuth: !!payload.authMode && !!payload.authConfig,
            authScheme: payload.authMode as z.infer<typeof ZAuthMode>,
            integrationSecrets: payload.authConfig,
          },
          connection: {
            entityId: payload.entityId,
            initiateData:
              (payload.connectionParams as Record<string, unknown>) || {},
            extra: {
              redirectURL: payload.redirectUri,
              labels: payload.labels || [],
            },
          },
        },
      });

      const connectionResponse = connection?.data?.connectionResponse;

      return new ConnectionRequest({
        connectionStatus: connectionResponse?.connectionStatus!,
        connectedAccountId: connectionResponse?.connectedAccountId!,
        redirectUri: connectionResponse?.redirectUrl!,
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  async reinitiateConnection(data: ReinitiateConnectionPayload) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "reinitiateConnection",
      file: this.fileName,
      params: { data },
    });
    try {
      ZReinitiateConnectionPayloadDto.parse(data);
      const connection = await apiClient.connections.reinitiateConnection({
        path: {
          connectedAccountId: data.connectedAccountId,
        },
        body: {
          data: data.data,
          redirectUri: data.redirectUri,
        },
      });

      const res = connection.data;

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

  async saveUserAccessData(data: SaveUserAccessDataParam) {
    try {
      ZSaveUserAccessDataParam.parse(data);
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
