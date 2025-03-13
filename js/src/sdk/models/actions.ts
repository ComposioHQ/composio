import { Client } from "@hey-api/client-axios";
import { z } from "zod";
import {
  ActionDetails,
  ActionExecutionReqDTO,
  ActionExecutionResDto,
  ActionsListResponseDTO,
} from "../client";
import apiClient from "../client/client";
import {
  ZActionGetParams,
  ZCustomAuthParams,
  ZExecuteParams,
  ZExecuteRequestParams,
  ZFindActionEnumsByUseCaseParams,
  ZGetListActionsParams,
  ZParameter,
} from "../types/action";
import ComposioSDKContext from "../utils/composioContext";
import { CEG } from "../utils/error";
import { TELEMETRY_LOGGER } from "../utils/telemetry";
import { TELEMETRY_EVENTS } from "../utils/telemetry/events";
import { AxiosBackendClient } from "./backendClient";

/**
 * Request types inferred from zod schemas
 */
export type ActionListParams = z.infer<typeof ZGetListActionsParams>;
export type HeaderSingleParameters = z.infer<typeof ZParameter>;
export type CustomAuth = z.infer<typeof ZCustomAuthParams>;
export type ActionExecuteParam = z.infer<typeof ZExecuteParams>;
export type ActionItemParam = z.infer<typeof ZActionGetParams>;
export type FindActionEnumsByUseCaseParam = z.infer<
  typeof ZFindActionEnumsByUseCaseParams
>;
export type ActionExecuteReqParam = z.infer<typeof ZExecuteRequestParams>;

/**
 * Response types
 */
export type ActionItemGetRes = ActionDetails;
export type ActionItemListRes = ActionsListResponseDTO;
export type ActionExecuteResponse = ActionExecutionResDto;
export type ActionFindActionEnumsByUseCaseRes = Array<string>;

export class Actions {
  // Remove this as we might not need it
  private backendClient: AxiosBackendClient;
  private client: Client;
  fileName: string = "js/src/sdk/models/actions.ts";

  constructor(backendClient: AxiosBackendClient, client: Client) {
    this.backendClient = backendClient;
    this.client = client;
  }

  /**
   * Retrieves details of a specific action in the Composio platform by providing its action name.
   *
   * The response includes the action's name, display name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {GetActionData} data The data for the request.
   * @returns {Promise<ActionItemGetRes[0]>} A promise that resolves to the details of the action.
   * @throws {ComposioError} If the request fails.
   */
  async get(data: ActionItemParam): Promise<ActionDetails> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "get",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZActionGetParams.parse(data);
      const actions = await apiClient.actionsV2.getActionV2({
        client: this.client,
        path: {
          actionId: parsedData.actionName,
        },
      });

      return actions.data!;
    } catch (e) {
      throw CEG.handleAllError(e);
    }
  }

  /**
   * Retrieves a list of all actions in the Composio platform.
   *
   * This method allows you to fetch a list of all the available actions. It supports pagination to handle large numbers of actions. The response includes an array of action objects, each containing information such as the action's name, display name, description, input parameters, expected response, associated app information, and enabled status.
   *
   * @param {GetListActionsData} data The data for the request.
   * @returns {Promise<ActionsListResponseDTO>} A promise that resolves to the list of all actions.
   * @throws {ComposioError} If the request fails.
   */
  async list(data: ActionListParams = {}): Promise<ActionsListResponseDTO> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "list",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZGetListActionsParams.parse(data);
      let apps = parsedData.apps;

      // Throw error if user has provided both filterByAvailableApps and apps
      if (data?.filterByAvailableApps && data?.apps) {
        throw new Error(
          "Both filterByAvailableApps and apps cannot be provided together"
        );
      }

      if (data?.filterByAvailableApps) {
        // Todo: To create a new API to get all integrated apps for a user instead of fetching all apps
        const integratedApps = await apiClient.appConnector.listAllConnectors();
        apps = integratedApps.data?.items.map((app) => app?.appName).join(",");
      }

      const response = await apiClient.actionsV2.listActionsV2({
        client: this.client,
        query: {
          actions: data.actions,
          apps: apps,
          showAll: data.showAll,
          tags: data.tags,
          filterImportantActions: data.filterImportantActions,
          showEnabledOnly: data.showEnabledOnly,
          usecaseLimit: data.usecaseLimit || undefined,
          useCase: data.useCase as string,
        },
      });
      return response.data!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Executes a specific action in the Composio platform.
   * This doesn't execute the local action and is wrapper over backend. Try to call this method directly from toolset
   *
   * This method allows you to trigger the execution of an action by providing its name and the necessary input parameters. The request includes the connected account ID to identify the app connection to use for the action, and the input parameters required by the action. The response provides details about the execution status and the response data returned by the action.
   *
   * @param {ExecuteActionData} data The data for the request.
   * @returns {Promise<ActionExecuteResponse>} A promise that resolves to the execution status and response data.
   * @throws {ComposioError} If the request fails.
   */
  async execute(data: ActionExecuteParam): Promise<ActionExecuteResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "execute",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZExecuteParams.parse(data);
      const { data: res } = await apiClient.actionsV2.executeActionV2({
        client: this.client,
        body: {
          ...parsedData.requestBody,
          sessionInfo: {
            ...(parsedData.requestBody?.sessionInfo || {}),
            sessionId:
              parsedData.requestBody?.sessionInfo?.sessionId ||
              ComposioSDKContext.sessionId,
          },
          allowTracing: Boolean(ComposioSDKContext?.allowTracing),
        } as ActionExecutionReqDTO,
        path: {
          actionId: parsedData.actionName,
        },
      });
      return res!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Finds all action enums by use case.
   *
   * @param {FindActionEnumsByUseCaseParam} data The data for the request.
   * @returns {Promise<ActionFindActionEnumsByUseCaseRes>} A promise that resolves to the list of action enums.
   * @throws {ComposioError} If the request fails.
   */
  async findActionEnumsByUseCase(
    data: FindActionEnumsByUseCaseParam
  ): Promise<ActionFindActionEnumsByUseCaseRes> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "findActionEnumsByUseCase",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZFindActionEnumsByUseCaseParams.parse(data);
      const { data: res } = await apiClient.actionsV2.advancedUseCaseSearch({
        client: this.client,
        query: {
          apps: parsedData.apps?.join(","),
          limit: parsedData.limit || undefined,
          filterByAvailableApps: parsedData.filterByAvailableApps,
        },
        body: {
          useCase: parsedData.useCase,
        },
      });
      return res!.items.map((item) => item.actions).flat() || [];
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }

  /**
   * Executes a action using Composio Proxy
   *
   * This method allows you to trigger the execution of an action by providing its name and the necessary input parameters. The request includes the connected account ID to identify the app connection to use for the action, and the input parameters required by the action. The response provides details about the execution status and the response data returned by the action.
   *
   * @param {ExecuteActionData} data The data for the request.
   * @returns {Promise<ActionExecuteResponse>} A promise that resolves to the execution status and response data.
   * @throws {ComposioError} If the request fails.
   */
  async executeRequest(
    data: ActionExecuteReqParam
  ): Promise<ActionExecuteResponse> {
    TELEMETRY_LOGGER.manualTelemetry(TELEMETRY_EVENTS.SDK_METHOD_INVOKED, {
      method: "executeRequest",
      file: this.fileName,
      params: { data },
    });
    try {
      const parsedData = ZExecuteRequestParams.parse(data);
      const { data: res } = await apiClient.actionsV2.executeWithHttpClient({
        client: this.client,
        body: {
          connectedAccountId: parsedData.connectedAccountId,
          endpoint: parsedData.endpoint,
          method: parsedData.method,
          parameters: parsedData.parameters,
          body: parsedData.body,
        },
      });
      return res!;
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
}
