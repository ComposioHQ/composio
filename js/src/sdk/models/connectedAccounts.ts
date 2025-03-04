import { Client } from "@hey-api/client-axios";
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
  ZListConnectionsData,
  ZReinitiateConnectionPayloadDto,
  ZSaveUserAccessDataParam,
  ZSingleConnectionParams,
} from "../types/connectedAccount";
import { ZAuthMode } from "../types/integration";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { AxiosBackendClient } from "./backendClient";

type ConnectedAccountsListData = z.infer<typeof ZListConnectionsData> & {
  /** @deprecated use appUniqueKeys field instead */
  appNames?: string;
};

type InitiateConnectionDataReq = z.infer<typeof ZInitiateConnectionDataReq>;

type SingleConnectionParam = z.infer<typeof ZSingleConnectionParams>;

type SaveUserAccessDataParam = z.infer<typeof ZSaveUserAccessDataParam>;

type ReinitiateConnectionPayload = z.infer<
  typeof ZReinitiateConnectionPayloadDto
>;

export type ConnectedAccountListResponse = GetConnectionsResponseDto;
export type SingleConnectedAccountResponse = ConnectedAccountResponseDTO;
export type SingleDeleteResponse = DeleteRowAPIDTO;

export type ConnectionChangeResponse = {
  status: "success";
  connectedAccountId: string;
};
export type ConnectionItem = ConnectionParams;

/**
 * Class representing connected accounts in the system.
 */
export class ConnectedAccounts {
  private backendClient: AxiosBackendClient;
  private fileName: string = "js/src/sdk/models/connectedAccounts.ts";
  private client: Client;
  /**
   * Initializes a new instance of the ConnectedAccounts class.
   * @param {AxiosBackendClient} backendClient - The backend client instance.
   */
  constructor(backendClient: AxiosBackendClient, client: Client) {
    this.backendClient = backendClient;
    this.client = client;
  }

  /**
   * List all connected accounts
   * @param {ConnectedAccountsListData} data - The data for the connected accounts list
   * @returns {Promise<ConnectedAccountListResponse>} - A promise that resolves to a list of connected accounts
   */
  async list(
    data: ConnectedAccountsListData
  ): Promise<ConnectedAccountListResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const { appNames, appUniqueKeys } = ZListConnectionsData.parse(data);
      const finalAppNames = appNames || appUniqueKeys?.join(",");
      const res = await apiClient.connections.listConnections({
        client: this.client,
        query: {
          ...data,
          appNames: finalAppNames,
        },
      });
      return res.data!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Get a single connected account
   * @param {SingleConnectionParam} data - The data for the single connection
   * @returns {Promise<SingleConnectedAccountResponse>} - A promise that resolves to a single connected account
   */
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
        client: this.client,
        path: data,
        throwOnError: true,
      });
      return res.data;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Delete a single connected account
   * @param {SingleConnectionParam} data - The data for the single connection
   * @returns {Promise<SingleDeleteResponse>} - A promise that resolves when the connected account is deleted
   */
  async delete(data: SingleConnectionParam): Promise<SingleDeleteResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "delete",
      file: this.fileName,
      params: { data },
    });
    try {
      ZSingleConnectionParams.parse(data);
      const res = await apiClient.connections.deleteConnection({
        client: this.client,
        path: data,
        throwOnError: true,
      });
      return res.data!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Disable a single connected account
   * @param {SingleConnectionParam} data - The data for the single connection
   * @returns {Promise<ConnectionChangeResponse>} - A promise that resolves when the connected account is disabled
   */
  async disable(
    data: SingleConnectionParam
  ): Promise<ConnectionChangeResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "disable",
      file: this.fileName,
      params: { data },
    });
    try {
      ZSingleConnectionParams.parse(data);
      const res = await apiClient.connections.disableConnection({
        client: this.client,
        path: data,
        throwOnError: true,
      });
      return {
        status: "success",
        connectedAccountId: data.connectedAccountId,
      };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Enable a single connected account
   * @param {SingleConnectionParam} data - The data for the single connection
   * @returns {Promise<ConnectionChangeResponse>} - A promise that resolves when the connected account is enabled
   */
  async enable(data: SingleConnectionParam): Promise<ConnectionChangeResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "enable",
      file: this.fileName,
      params: { data },
    });
    try {
      ZSingleConnectionParams.parse(data);
      await apiClient.connections.enableConnection({
        client: this.client,
        path: {
          connectedAccountId: data.connectedAccountId,
        },
        throwOnError: true,
      });
      return {
        status: "success",
        connectedAccountId: data.connectedAccountId,
      };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Initiate a connection
   * @param {InitiateConnectionDataReq} payload - The payload for the connection initiation
   * @returns {Promise<ConnectionRequest>} - A promise that resolves to a connection request
   */
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
        client: this.client,
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
        client: this.client,
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Reinitiate a connection
   * @param {ReinitiateConnectionPayload} data - The payload for the connection reinitialization
   * @returns {Promise<ConnectionRequest>} - A promise that resolves to a connection request
   */
  async reinitiateConnection(data: ReinitiateConnectionPayload) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "reinitiateConnection",
      file: this.fileName,
      params: { data },
    });
    try {
      ZReinitiateConnectionPayloadDto.parse(data);
      const connection = await apiClient.connections.reinitiateConnection({
        client: this.client,
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
        client: this.client,
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
  private client: Client;
  constructor({
    connectionStatus,
    connectedAccountId,
    redirectUri,
    client,
  }: {
    connectionStatus: string;
    connectedAccountId: string;
    redirectUri: string | null;
    client: Client;
  }) {
    this.connectionStatus = connectionStatus;
    this.connectedAccountId = connectedAccountId;
    this.redirectUrl = redirectUri;
    this.client = client;
  }

  async saveUserAccessData(data: SaveUserAccessDataParam) {
    try {
      ZSaveUserAccessDataParam.parse(data);
      const { data: connectedAccount } =
        await apiClient.connections.getConnection({
          client: this.client,
          path: { connectedAccountId: this.connectedAccountId },
        });
      if (!connectedAccount) throw new Error("Connected account not found");
      return await apiClient.connections.initiateConnection({
        client: this.client,
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

  /**
   * Wait until the connection becomes active
   * @param {number} timeout - The timeout for the connection to become active
   * @returns {Promise<Connection>} - A promise that resolves to the connection
   */
  async waitUntilActive(timeout = 60) {
    try {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout * 1000) {
        const connection = await apiClient.connections
          .getConnection({
            client: this.client,
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
