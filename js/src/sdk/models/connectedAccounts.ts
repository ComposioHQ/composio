import { z } from "zod";
import logger from "../../utils/logger";
import {
  ConnectedAccountResponseDTO,
  ConnectionParams,
  DeleteRowAPIDTO,
  GetConnectionsResponseDto,
  GetConnectorInfoResDTO,
} from "../client";
import { default as apiClient, default as client } from "../client/client";
import {
  ZInitiateConnectionDataReq,
  ZInitiateConnectionPayloadDto,
  ZListConnectionsData,
  ZSaveUserAccessDataParam,
  ZSingleConnectionParams,
} from "../types/connectedAccount";
import { ZAuthMode } from "../types/integration";
import { CEG } from "../utils/error";
import { COMPOSIO_SDK_ERROR_CODES } from "../utils/errors/src/constants";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { Apps } from "./apps";
import { BackendClient } from "./backendClient";
import { Integrations } from "./integrations";

// Schema type from conectedAccount.ts
type ConnectedAccountsListData = z.infer<typeof ZListConnectionsData>;
type InitiateConnectionDataReq = z.infer<typeof ZInitiateConnectionDataReq>;
type SingleConnectionParam = z.infer<typeof ZSingleConnectionParams>;
type SaveUserAccessDataParam = z.infer<typeof ZSaveUserAccessDataParam>;
type InitiateConnectionPayloadDto = z.infer<
  typeof ZInitiateConnectionPayloadDto
>;

export type ConnectedAccountListResponse = GetConnectionsResponseDto;
export type SingleConnectedAccountResponse = ConnectedAccountResponseDTO;
export type SingleDeleteResponse = DeleteRowAPIDTO;
export type ConnectionItem = ConnectionParams;

export class ConnectedAccounts {
  private backendClient: BackendClient;
  private integrations: Integrations;
  private apps: Apps;
  private fileName: string = "js/src/sdk/models/connectedAccounts.ts";

  constructor(backendClient: BackendClient) {
    this.backendClient = backendClient;
    this.integrations = new Integrations(this.backendClient);
    this.apps = new Apps(this.backendClient);
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

  async create(data: InitiateConnectionPayloadDto): Promise<ConnectionRequest> {
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

  async getIntegration(data: { integrationId: string }) {
    const res = await apiClient.appConnector.getConnectorInfo({
      path: { integrationId: data.integrationId },
    });
    return res.data;
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
      const {
        authMode,
        appName,
        entityId,
        redirectUri,
        data,
        labels,
        authConfig,
        integrationId,
        connectionParams,
      } = payload;
      if (!integrationId && !appName) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
          {
            message: "Please pass appName or integrationId",
            description:
              "We need atleast one of the params to initiate a connection",
          }
        );
      }

      /* Get the integration */
      const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

      const isIntegrationIdPassed = !!integrationId;
      let integration = isIntegrationIdPassed
        ? await this.integrations.get({ integrationId: integrationId })
        : null;

      if (!integration && !!authMode) {
        const integrations = await this.integrations.list({
          appName: appName,
        });
        integration = integrations.items?.find((integration) => {
          return integration.authScheme === authMode;
        }) as GetConnectorInfoResDTO;
      }

      if (isIntegrationIdPassed && !integration) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
          {
            message: "Integration not found",
            description: "The integration with the given id does not exist",
          }
        );
      }

      /* If integration is not found, create a new integration */
      if (!isIntegrationIdPassed) {
        const app = await this.apps.get({ appKey: appName! });

        if (!!authMode && !!authConfig) {
          integration = await this.integrations.create({
            appId: app.appId!,
            name: `integration_${timestamp}`,
            authScheme: authMode as z.infer<typeof ZAuthMode>,
            authConfig: authConfig,
            useComposioAuth: false,
          });
        } else {
          const isTestConnectorAvailable =
            app.testConnectors && app.testConnectors.length > 0;

          if (!isTestConnectorAvailable && app.no_auth === false) {
            logger.debug(
              "Auth schemes not provided, available auth schemes and authConfig"
            );
            // @ts-ignore
            for (const authScheme of app.auth_schemes) {
              logger.debug(
                "authScheme:",
                authScheme.name,
                "\n",
                "fields:",
                authScheme.fields
              );
            }

            throw new Error("Please pass authMode and authConfig.");
          }

          integration = await this.integrations.create({
            appId: app.appId!,
            name: `integration_${timestamp}`,
            useComposioAuth: true,
          });
        }
      }

      const res = await client.connections
        .initiateConnection({
          body: {
            integrationId: integration?.id!,
            entityId: entityId,
            labels: labels,
            redirectUri: redirectUri,
            data: data || connectionParams || {},
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
