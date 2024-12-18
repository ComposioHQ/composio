import { ActionExecutionReqDTO, ActionProxyRequestConfigDTO, ActionsListResponseDTO, AdvancedUseCaseSearchData } from "../client";
import apiClient from "../client/client";
import { CEG } from "../utils/error";
import { BackendClient } from "./backendClient";

/**
 * The `Actions` class provides methods to interact with the Composio platform's actions.
 * It allows fetching details of specific actions, listing all actions, and executing actions.
 *
 * - `get` method retrieves details of a specific action.
 * - `list` method retrieves a list of all actions.
 * - `execute` method executes a specific action.
 *
 * Each method returns a `CancelablePromise` which can be canceled. If canceled, the promise
 * will reject with a `Cancellation` object.
 *
 * @typeParam Composio The client configuration object type.
 * @groupDescription Methods
 * The methods in this class are grouped under 'Actions Methods' and provide functionalities
 * to interact with actions in the Composio platform. This includes fetching, listing, and
 * executing actions.
 */

export type GetListActionsData = {
    /**
     * Name of the apps like "github", "linear" separated by a comma
     */
    apps?: string;
    /**
     * Filter by Action names
     */
    actions?: string;
    /**
     * Filter by Action tags
     */
    tags?: string;
    /**
     * Filter by use case
     */
    useCase?: string | undefined;
    /**
     * Limit of use-cases based search
     */
    usecaseLimit?: number;
    /**
     * Show all actions - i.e disable pagination
     */
    showAll?: boolean;
    /**
     * Show actions enabled for the API Key
     */
    showEnabledOnly?: boolean;
    /**
     * Use smart tag filtering
     */
    filterImportantActions?: boolean;
    /**
     * Should search in available apps only
     */
    filterByAvailableApps?: boolean;
}

export type Parameter = {
    /**
     * The name of the parameter.
     */
    name: string;

    /**
     * The location of the parameter (e.g., query, header).
     */
    in: string;

    /**
     * The value of the parameter.
     */
    value: string | number;
};

export type CustomAuthData = {
    /**
     * The base URL for the custom authentication.
     */
    base_url?: string;

    /**
     * An array of parameters for the custom authentication.
     */
    parameters: Parameter[];

    /**
     * An optional object containing the body for the custom authentication.
     */
    body?: Record<string, unknown>;
}

export type ExecuteActionData = {
    /**
     * The name of the action to execute.
     */
    actionName: string;
    requestBody?: {
        /**
         * The unique identifier of the connection to use for executing the action.
         */
        connectedAccountId?: string;
        /**
         * An object containing the input parameters for the action. If you want to execute 
         * NLP based action (i.e text), you can use text parameter instead of input.
         */
        input?: {
            [key: string]: unknown;
        };
        appName?: string;
        /**
         * The text to supply to the action which will be automatically converted to 
         * appropriate input parameters.
         */
        text?: string;

        /**
         * The custom authentication configuration for executing the action.
         */
        authConfig?: CustomAuthData;
    };
};

export type ExecuteActionResponse = {
    /**
     * An object containing the details of the action execution.
     */
    execution_details?: {
        /**
         * A boolean indicating whether the action was executed successfully.
         *
         */
        executed?: boolean;
    };
    /**
     * An object containing the response data from the action execution.
     */
    response_data?: {
        [key: string]: unknown;
    };
};
export class Actions {
    backendClient: BackendClient;

    constructor(backendClient: BackendClient) {
        this.backendClient = backendClient;
    }

    /**
     * Retrieves details of a specific action in the Composio platform by providing its action name.
     * 
     * The response includes the action's name, display name, description, input parameters, expected response, associated app information, and enabled status.
     * 
     * @param {GetActionData} data The data for the request.
     * @returns {CancelablePromise<GetActionResponse[0]>} A promise that resolves to the details of the action.
     * @throws {ApiError} If the request fails.
     */
    async get(data: { actionName: string; }) {
        try{
        const actions = await apiClient.actionsV2.getActionV2({
            path: {
                actionId: data.actionName
            }
        });

            return (actions.data!);
        } catch(e){
            throw CEG.handleError(e)
        }
    }

    /**
     * Retrieves a list of all actions in the Composio platform.
     * 
     * This method allows you to fetch a list of all the available actions. It supports pagination to handle large numbers of actions. The response includes an array of action objects, each containing information such as the action's name, display name, description, input parameters, expected response, associated app information, and enabled status.
     * 
     * @param {GetListActionsData} data The data for the request.
     * @returns {Promise<ActionsListResponseDTO>} A promise that resolves to the list of all actions.
     * @throws {ApiError} If the request fails.
     */
    async list(data: GetListActionsData = {}): Promise<ActionsListResponseDTO> {
        try {

            let apps = data.apps;
            
            // Throw error if user has provided both filterByAvailableApps and apps
            if(data?.filterByAvailableApps && data?.apps){
                throw new Error("Both filterByAvailableApps and apps cannot be provided together");
            }

            if(data?.filterByAvailableApps){
                // Todo: To create a new API to get all integrated apps for a user instead of fetching all apps
                const integratedApps = await apiClient.appConnector.listAllConnectors();
                apps = integratedApps.data?.items.map((app)=> app?.appName).join(",");
            }
            
            const response = await apiClient.actionsV2.listActionsV2({
                query: {
                    actions: data.actions,
                    apps: apps,
                    showAll: data.showAll,
                    tags: data.tags,
                    useCase: data.useCase as string,
                    filterImportantActions: data.filterImportantActions,
                    showEnabledOnly: data.showEnabledOnly,
                    usecaseLimit: data.usecaseLimit || undefined
                }
            });
            return response.data!;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    /**
     * Executes a specific action in the Composio platform.
     * 
     * This method allows you to trigger the execution of an action by providing its name and the necessary input parameters. The request includes the connected account ID to identify the app connection to use for the action, and the input parameters required by the action. The response provides details about the execution status and the response data returned by the action.
     * 
     * @param {ExecuteActionData} data The data for the request.
     * @returns {Promise<ActionExecutionResDto>} A promise that resolves to the execution status and response data.
     * @throws {ApiError} If the request fails.
     */
    async execute(data: ExecuteActionData){
        try {
            const { data: res } = await apiClient.actionsV2.executeActionV2({
                body: data.requestBody as unknown as ActionExecutionReqDTO,
                path: {
                    actionId: data.actionName
                }
            });
            return res!;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async findActionEnumsByUseCase(data: {
        apps: Array<string>,
        useCase: string,
        limit?: number,
        filterByAvailableApps?: boolean
    }): Promise<Array<string>> {
        try {
            const { data: res } = await apiClient.actionsV2.advancedUseCaseSearch({
                query: {
                    apps: data.apps.join(","),
                    limit: data.limit || undefined,
                    filterByAvailableApps: data.filterByAvailableApps || false
                },
                body:{
                    useCase: data.useCase,
                }
            });
            return res!.items.map((item) => item.actions).flat() || [];
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    /**
     * Executes a action using Composio Proxy
     * 
     * This method allows you to trigger the execution of an action by providing its name and the necessary input parameters. The request includes the connected account ID to identify the app connection to use for the action, and the input parameters required by the action. The response provides details about the execution status and the response data returned by the action.
     * 
     * @param {ExecuteActionData} data The data for the request.
     * @returns {Promise<ActionExecutionResDto>} A promise that resolves to the execution status and response data.
     * @throws {ApiError} If the request fails.
     */

    async executeRequest(data: ActionProxyRequestConfigDTO){
        try {
            const { data: res } = await apiClient.actionsV2.executeActionProxyV2({
                body: data as unknown as ActionProxyRequestConfigDTO
            });
            return res!;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }
}