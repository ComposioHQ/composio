import { z } from "zod";
import { GetConnectionsResponseDto } from "../client";
import {
  ZConnectionParams,
  ZExecuteActionParams,
  ZInitiateConnectionParams,
  ZTriggerSubscribeParam,
} from "../types/entity";
import { CEG } from "../utils/error";
import { COMPOSIO_SDK_ERROR_CODES } from "../utils/errors/src/constants";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { ActionExecuteResponse, Actions } from "./actions";
import { ActiveTriggers } from "./activeTriggers";
import { Apps } from "./apps";
import { AxiosBackendClient } from "./backendClient";
import {
  ConnectedAccounts,
  ConnectionItem,
  ConnectionRequest,
} from "./connectedAccounts";
import { Integrations } from "./integrations";
import { Triggers } from "./triggers";

const LABELS = {
  PRIMARY: "primary",
};

// Types from zod schemas
export type TriggerSubscribeParam = z.infer<typeof ZTriggerSubscribeParam>;
export type ConnectionParams = z.infer<typeof ZConnectionParams> & {
  /** @deprecated use appName field instead */
  app?: string;
  appName?: string;
};
export type InitiateConnectionParams = z.infer<
  typeof ZInitiateConnectionParams
>;
export type ExecuteActionParams = z.infer<typeof ZExecuteActionParams>;

// type from API
export type ConnectedAccountListRes = GetConnectionsResponseDto;

export class Entity {
  id: string;
  private backendClient: AxiosBackendClient;
  private triggerModel: Triggers;
  private actionsModel: Actions;
  private apps: Apps;
  private connectedAccounts: ConnectedAccounts;
  private integrations: Integrations;
  private activeTriggers: ActiveTriggers;

  private fileName: string = "js/src/sdk/models/Entity.ts";

  constructor(backendClient: AxiosBackendClient, id: string = "default") {
    this.backendClient = backendClient;
    this.id = id;
    this.triggerModel = new Triggers(
      this.backendClient,
      this.backendClient.instance
    );
    this.actionsModel = new Actions(
      this.backendClient,
      this.backendClient.instance
    );
    this.apps = new Apps(this.backendClient, this.backendClient.instance);
    this.connectedAccounts = new ConnectedAccounts(
      this.backendClient,
      this.backendClient.instance
    );
    this.integrations = new Integrations(
      this.backendClient,
      this.backendClient.instance
    );
    this.activeTriggers = new ActiveTriggers(
      this.backendClient,
      this.backendClient.instance
    );
  }

  /**
   * Executes an action for an entity.
   *
   * @param {string} actionName The name of the action to execute.
   * @param {Record<string, unknown>} params The parameters for the action.
   * @param {string} text The text to pass to the action. This can be to perform NLA execution
   * @param {string} connectedAccountId The ID of the connected account to use for the action.
   * @returns {Promise<ActionExecuteResponse>} A promise that resolves to the response from the action execution.
   * @throws {ComposioError} If the request fails.
   */
  async execute({
    actionName,
    params,
    text,
    connectedAccountId,
  }: ExecuteActionParams): Promise<ActionExecuteResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "execute",
      file: this.fileName,
      params: { actionName, params, text, connectedAccountId },
    });
    try {
      ZExecuteActionParams.parse({
        actionName,
        params,
        text,
        connectedAccountId,
      });
      const action = await this.actionsModel.get({
        actionName: actionName,
      });
      if (!action) {
        throw new Error(`Could not find action: ${actionName}`);
      }
      const app = await this.apps.get({
        appKey: action.appKey!,
      });
      if (app.no_auth) {
        return this.actionsModel.execute({
          actionName: actionName,
          requestBody: {
            input: params,
            appName: action.appKey,
          },
        });
      }
      const connectedAccount = await this.getConnection({
        app: action.appKey,
        connectedAccountId,
      });

      if (!connectedAccount) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.SDK.NO_CONNECTED_ACCOUNT_FOUND,
          {
            message: `Could not find a connection with app='${action.appKey}' and entity='${this.id}'`,
            description: `Could not find a connection with app='${action.appKey}' and entity='${this.id}'`,
          }
        );
      }
      return this.actionsModel.execute({
        actionName: actionName,
        requestBody: {
          // @ts-ignore
          connectedAccountId: connectedAccount?.id as unknown as string,
          input: params,
          appName: action.appKey,
          text: text,
        },
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves the required parameters for a specific authentication scheme of an app in the Composio platform.
   *
   * This method allows clients to fetch the necessary parameters for a specific authentication scheme of an app by providing its unique key and the authentication scheme.
   *
   * @param {ConnectionParams} data The data for the request, including the app's unique key and the authentication scheme.
   * @returns {Promise<RequiredParamsResponse>} A promise that resolves to the required parameters for the authentication scheme.
   * @throws {ComposioError} If the request fails.
   */
  async getConnection({ app, appName, connectedAccountId }: ConnectionParams) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getConnection",
      file: this.fileName,
      params: { app, appName, connectedAccountId },
    });
    try {
      const finalApp = appName || app;
      ZConnectionParams.parse({ app: finalApp, connectedAccountId });

      if (!finalApp && !connectedAccountId) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
          {
            message: "App or connectedAccountId is required",
            description: "App or connectedAccountId is required",
          }
        );
      }
      if (connectedAccountId) {
        return await this.connectedAccounts.get({
          connectedAccountId,
        });
      }

      let latestAccount = null;
      let latestCreationDate: Date | null = null;
      const connectedAccounts = await this.connectedAccounts.list({
        user_uuid: this.id!,
      });

      for (const account of connectedAccounts.items!) {
        if (account?.labels && account?.labels.includes(LABELS.PRIMARY)) {
          latestAccount = account;
          break;
        }
      }
      if (!latestAccount) {
        for (const connectedAccount of connectedAccounts.items!) {
          if (
            finalApp?.toLocaleLowerCase() ===
            connectedAccount.appName.toLocaleLowerCase()
          ) {
            const creationDate = new Date(connectedAccount.createdAt!);
            if (
              (!latestAccount ||
                (latestCreationDate && creationDate > latestCreationDate)) &&
              connectedAccount.status === "ACTIVE"
            ) {
              latestCreationDate = creationDate;
              latestAccount = connectedAccount;
            }
          }
        }
      }
      if (!latestAccount) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.SDK.NO_CONNECTED_ACCOUNT_FOUND,
          {
            message: `Could not find a connection with app='${finalApp}' and entity='${this.id}'`,
            description: `Could not find a connection with app='${finalApp}' and entity='${this.id}'`,
          }
        );
      }

      const connectedAccount = await this.connectedAccounts.get({
        connectedAccountId: latestAccount.id!,
      });

      if (!connectedAccount) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.SDK.NO_CONNECTED_ACCOUNT_FOUND,
          {
            message: `Could not find a connection with app='${finalApp}' and entity='${this.id}'`,
            description: `Could not find a connection with app='${finalApp}' and entity='${this.id}'`,
          }
        );
      }

      return connectedAccount;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves the required parameters for a specific authentication scheme of an app in the Composio platform.
   *
   * This method allows clients to setup a trigger for an app by providing its unique key and the trigger name.
   *
   * @param {TriggerSubscribeParam} data The data for the request, including the app's unique key and the trigger name.
   * @returns {Promise<RequiredParamsResponse>} A promise that resolves to the required parameters for the authentication scheme.
   * @throws {ComposioError} If the request fails.
   */
  async setupTrigger({
    app,
    appName,
    triggerName,
    config,
  }: TriggerSubscribeParam) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "setupTrigger",
      file: this.fileName,
      params: { app, appName, triggerName, config },
    });
    try {
      const finalApp = appName || app;
      ZTriggerSubscribeParam.parse({ app: finalApp, triggerName, config });
      const connectedAccount = await this.getConnection({ app: finalApp });
      if (!connectedAccount) {
        throw CEG.getCustomError(
          COMPOSIO_SDK_ERROR_CODES.SDK.NO_CONNECTED_ACCOUNT_FOUND,
          {
            message: `Could not find a connection with app='${finalApp}' and entity='${this.id}'`,
            description: `Could not find a connection with app='${finalApp}' and entity='${this.id}'`,
          }
        );
      }
      const trigger = await this.triggerModel.setup({
        connectedAccountId: connectedAccount.id!,
        triggerName,
        config,
      });
      return trigger;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves the required parameters for a specific authentication scheme of an app in the Composio platform.
   *
   * This method allows clients to disable a trigger by providing its trigger ID.
   *
   * @param {string} triggerId The ID of the trigger to disable.
   * @returns {Promise<{ status: string }>} A promise that resolves to the status of the trigger disablement.
   * @throws {ComposioError} If the request fails.
   */
  async disableTrigger(triggerId: string) {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "disableTrigger",
      file: this.fileName,
      params: { triggerId },
    });
    try {
      await this.activeTriggers.disable({ triggerId: triggerId });
      return { status: "success" };
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves all connections for an entity.
   *
   * @returns {Promise<ConnectionItem[]>} A promise that resolves to an array of connection items.
   * @throws {ComposioError} If the request fails.
   */
  async getConnections(): Promise<ConnectionItem[]> {
    /**
     * Get all connections for an entity.
     */
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getConnections",
      file: this.fileName,
      params: {},
    });
    try {
      const connectedAccounts = await this.connectedAccounts.list({
        user_uuid: this.id,
      });
      return connectedAccounts.items!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Retrieves all active triggers for an entity.
   *
   * @returns {Promise<ActiveTrigger[]>} A promise that resolves to an array of active triggers.
   * @throws {ComposioError} If the request fails.
   */
  async getActiveTriggers() {
    /**
     * Get all active triggers for an entity.
     */
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "getActiveTriggers",
      file: this.fileName,
      params: {},
    });
    try {
      const connectedAccounts = await this.getConnections();
      const activeTriggers = await this.activeTriggers.list({
        // @ts-ignore
        connectedAccountIds: connectedAccounts!
          .map((account) => account.id!)
          .join(","),
      });
      return activeTriggers;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Initiate a connection for an entity.
   * @param {InitiateConnectionParams} data The data for the request, including the app's unique key and the authentication scheme.
   * @returns {Promise<ConnectionRequest>} A promise that resolves to the connection request.
   * @throws {ComposioError} If the request fails.
   */
  async initiateConnection(
    data: InitiateConnectionParams
  ): Promise<ConnectionRequest> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "initiateConnection",
      file: this.fileName,
      params: { data },
    });
    try {
      const {
        appName,
        authMode,
        authConfig,
        integrationId,
        connectionParams,
        redirectUri,
        labels,
      } = ZInitiateConnectionParams.parse(data);

      // Initiate the connection process
      return this.connectedAccounts.initiate({
        authMode: authMode,
        authConfig: authConfig,
        integrationId: integrationId,
        appName: appName,
        entityId: this.id,
        redirectUri: redirectUri || data.config?.redirectUrl || "",
        connectionParams: connectionParams,
        labels: labels || data.config?.labels || [],
      });
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
