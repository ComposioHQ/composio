import { Composio } from "../sdk";
import { ExecEnv, WorkspaceFactory } from "../env/factory";
import { COMPOSIO_BASE_URL } from "./client/core/OpenAPI";
import { RemoteWorkspace } from "../env/base";
import type { IPythonActionDetails, Optional, Sequence } from "./types";
import { getEnvVariable } from "../utils/shared";
import { WorkspaceConfig } from "../env/config";
import { Workspace } from "../env";
import logger from "../utils/logger";
import { AppConnectorControllerGetConnectorInfoResponse, ExecuteActionResDTO } from "./client/types.gen";
import {  saveFile } from "./utils/fileUtils";
import { convertReqParams, converReqParamForActionExecution } from "./utils";
import { ActionRegistry, CreateActionOptions } from "./actionRegistry";
import z from 'zod';
import { getUserDataJson } from "./utils/config";


type GetListActionsResponse = any;

export class ComposioToolSet {
    client: Composio;
    apiKey: string;
    runtime: string | null;
    entityId: string;
    workspace: WorkspaceFactory;
    workspaceEnv: ExecEnv;

    localActions: IPythonActionDetails["data"] | undefined;
    customActionRegistry: ActionRegistry;

    constructor(
        apiKey: string | null,
        baseUrl: string | null = COMPOSIO_BASE_URL,
        runtime: string | null = null,
        entityId: string = "default",
        workspaceConfig: WorkspaceConfig = Workspace.Host()
    ) {  
        const clientApiKey: string | undefined = apiKey || getEnvVariable("COMPOSIO_API_KEY") || getUserDataJson().api_key;
        if (!clientApiKey) {
            throw new Error("API key is required, please pass it either by using `COMPOSIO_API_KEY` environment variable or during initialization");
        }
        this.apiKey = clientApiKey;
        this.client = new Composio(this.apiKey, baseUrl || undefined, runtime as string );
        this.customActionRegistry = new ActionRegistry(this.client);
        this.runtime = runtime;
        this.entityId = entityId;

        if(!workspaceConfig.config.composioBaseURL) {
            workspaceConfig.config.composioBaseURL = baseUrl
        }
        if(!workspaceConfig.config.composioAPIKey) {
            workspaceConfig.config.composioAPIKey = apiKey;
        }
        this.workspace = new WorkspaceFactory(workspaceConfig.env, workspaceConfig);
        this.workspaceEnv = workspaceConfig.env;

        if (typeof process !== 'undefined') {
            process.on("exit", async () => {
                await this.workspace.workspace?.teardown();
            });
        }

    }

    async getExpectedParamsForUser(
        params: { app?: string; integrationId?: string; entityId?: string; authScheme?: "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT" } = {},
    ): Promise<{ expectedInputFields: AppConnectorControllerGetConnectorInfoResponse["expectedInputFields"], integrationId: string, authScheme: "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT" }> {
        const { app, entityId } = params;
        let { integrationId } = params;
        if (integrationId === null && app === null) {
            throw new Error(
                "Both `integration_id` and `app` cannot be None"
            );
        }

        if (!integrationId) {
            try {
                const integrations = await this.client.integrations.list({
                    appName: app!,
                    showDisabled: false
                })
                if (params.authScheme && integrations) {
                    integrations.items = integrations.items.filter((integration: any) => integration.authScheme === params.authScheme);
                }
                integrationId = (integrations?.items[0] as any)?.id;
            } catch (_) {
                // do nothing
            }
        }

        let integration =  integrationId ? (await this.client.integrations.get({
            integrationId: integrationId!
        })) : undefined;

        if(integration) {
            return {
                expectedInputFields: integration.expectedInputFields,
                integrationId: integration.id!,
                authScheme: integration.authScheme as "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT"
            }
        }

        const appInfo = await this.client.apps.get({
            appKey: app!.toLocaleLowerCase()
        });

        const preferredAuthScheme = ["OAUTH2", "OAUTH1", "API_KEY", "BASIC", "BEARER_TOKEN", "BASIC_WITH_JWT"];

        let schema: typeof preferredAuthScheme[number] | undefined = params.authScheme;
        
        if(!schema) {
            for(const scheme of preferredAuthScheme) {
                if(appInfo.auth_schemes?.map((_authScheme: any) => _authScheme.mode).includes(scheme)) {
                    schema = scheme;
                    break;
                }
            }
        }

        const areNoFieldsRequiredForIntegration = (appInfo.testConnectors?.length ?? 0) > 0 || ((appInfo.auth_schemes?.find((_authScheme: any) => _authScheme.mode === schema) as any)?.fields?.filter((field: any) => !field.expected_from_customer)?.length ?? 0) == 0;

        if (!areNoFieldsRequiredForIntegration) {
            throw new Error(
                `No default credentials available for this app, please create new integration by going to app.composio.dev or through CLI - composio add ${appInfo.key}`
            );
        }

        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

        if(appInfo.testConnectors?.length! > 0) {
            integration = await this.client.integrations.create({
                appId: appInfo.appId,
                name: `integration_${timestamp}`,
                authScheme: schema,
                authConfig: {},
                useComposioAuth: true,
            });

            return { 
                expectedInputFields: integration?.expectedInputFields!,
                integrationId: integration?.id!,
                authScheme: integration?.authScheme as "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT"
            }
        }

        if(!schema) {
            throw new Error(
                `No supported auth scheme found for \`${String(app)}\`, ` +
                "Please create an integration and use the ID to " +
                "get the expected parameters."
            );
        }

        integration = await this.client.integrations.create({
            appId: appInfo.appId,
            name: `integration_${timestamp}`,
            authScheme: schema,
            authConfig: {},
            useComposioAuth: false,
        });

        if(!integration) {
            throw new Error("An unexpected error occurred while creating the integration, please create an integration manually and use its ID to get the expected parameters");
        }
        return { 
            expectedInputFields: integration.expectedInputFields,
            integrationId: integration.id!,
            authScheme: integration.authScheme as "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT"
        }
    }

    async setup() {
        await this.workspace.new();

        if(!this.localActions && this.workspaceEnv !== ExecEnv.HOST) {
            this.localActions = await (this.workspace.workspace as RemoteWorkspace).getLocalActionsSchema();
        }
    }

    async getActionsSchema(
        filters: { actions?: Optional<Sequence<string>> } = {},
        entityId?: Optional<string>
    ): Promise<Sequence<NonNullable<GetListActionsResponse["items"]>[0]>> {
        await this.setup();
        let actions = (await this.client.actions.list({
            actions: filters.actions?.join(","),
            showAll: true
        })).items;
        const localActionsMap = new Map<string, NonNullable<GetListActionsResponse["items"]>[0]>();
        filters.actions?.forEach((action: string) => {
            const actionData = this.localActions?.find((a: any) => a.name === action);
            if (actionData) {
                localActionsMap.set(actionData.name!, actionData);
            }
        });
        const uniqueLocalActions = Array.from(localActionsMap.values());
        const _newActions = filters.actions?.map((action: string) => action.toLowerCase());
        const toolsWithCustomActions = (await this.customActionRegistry.getActions({ actions: _newActions!})).filter((action: any) => {
            if (_newActions && !_newActions.includes(action.parameters.title.toLowerCase()!)) {
                return false;
            }
            return true;
        }).map((action: any) => {
            return action;
        });

        const toolsActions = [...actions!, ...uniqueLocalActions, ...toolsWithCustomActions];
        
        return toolsActions.map((action: any) => {
            return this.modifyActionForLocalExecution(action);
        });
    }

    async getAuthParams(data: {connectedAccountId: string}) {
        return this.client.connectedAccounts.getAuthParams({
            connectedAccountId: data.connectedAccountId
        })
    }

    async getToolsSchema(
        filters: {
            actions?: Optional<Array<string>>;
            apps?: Array<string>;
            tags?: Optional<Array<string>>;
            useCase?: Optional<string>;
        },
        entityId?: Optional<string>
    ): Promise<Sequence<NonNullable<GetListActionsResponse["items"]>[0]>> {
        await this.setup();

        const apps =  await this.client.actions.list({
            ...(filters?.apps && { apps: filters?.apps?.join(",") }),
            ...(filters?.tags && { tags: filters?.tags?.join(",") }),
            ...(filters?.useCase && { useCase: filters?.useCase }),
            ...(filters?.actions && { actions: filters?.actions?.join(",") }),
         });
        const localActions = new Map<string, NonNullable<GetListActionsResponse["items"]>[0]>();
        if(filters.apps && Array.isArray(filters.apps)) {
            for (const appName of filters.apps!) {
                const actionData = this.localActions?.filter((a: any) => a.appName === appName);
                if(actionData) {
                    for (const action of actionData) {
                        localActions.set(action.name, action);
                    }
                }
            }
        }
        const uniqueLocalActions = Array.from(localActions.values());

        const toolsWithCustomActions = (await this.customActionRegistry.getAllActions()).filter((action: any) => {
            if (filters.actions && !filters.actions.some(actionName => actionName.toLowerCase() === action.metadata.actionName!.toLowerCase())) {
                return false;
            }
            if (filters.apps && !filters.apps.some(appName => appName.toLowerCase() === action.metadata.toolName!.toLowerCase())) {
                return false;
            }
            if (filters.tags && !filters.tags.some(tag => tag.toLocaleLowerCase() === "custom".toLocaleLowerCase())) {
                return false;
            }
            return true;
        }).map((action: any) => {
            console.log("Action is", action);
            return action.schema;
        });

        const toolsActions = [...apps.items!, ...uniqueLocalActions, ...toolsWithCustomActions];
        
        return toolsActions.map((action: any) => {
            return this.modifyActionForLocalExecution(action);
        });
        
    }

    modifyActionForLocalExecution(toolSchema: any) {
        const properties = convertReqParams(toolSchema.parameters.properties);
        toolSchema.parameters.properties = properties;
        const response = toolSchema.response.properties;

        for (const responseKey of Object.keys(response)) {
            if(responseKey === "file") {
                response["file_uri_path"] = {
                    type: "string",
                    title: "Name",
                    description: "Local absolute path to the file or http url to the file"
                }

                delete response[responseKey];
            }
        }

        return toolSchema;
    }


    async getActions(
        filters: {
            actions?: Optional<Sequence<string>>
        } = {},
        entityId?: Optional<string>
    ): Promise<any> {
        throw new Error("Not implemented");
    }

    async getTools(
        filters: {
            apps: Sequence<string>;
            tags?: Optional<Array<string>>;
            useCase?: Optional<string>;
        },
        entityId?: Optional<string>
    ): Promise<any> {
        throw new Error("Not implemented");
    }

    async createAction(options: CreateActionOptions) {
        return this.customActionRegistry.createAction(options);
    }

    private isCustomAction(action: string) {
        return this.customActionRegistry.getActions({ actions: [action] }).then((actions: any) => actions.length > 0);
    }

    async executeAction(
        action: string,
        params: Record<string, any>,
        entityId: string = "default",
        nlaText: string = ""
    ): Promise<Record<string, any>> {
        // Custom actions are always executed in the host/local environment for JS SDK
        if(await this.isCustomAction(action)) {
            return this.customActionRegistry.executeAction(action, params, {
                entityId: entityId
            });
        }
        if(this.workspaceEnv && this.workspaceEnv !== ExecEnv.HOST) {
            const workspace = await this.workspace.get();
            return workspace.executeAction(action, params, {
                entityId: this.entityId
            });
        }
        params = await converReqParamForActionExecution(params);
        const data =  await this.client.getEntity(entityId).execute(action, params, nlaText);

        return this.processResponse(data,{
            action: action,
            entityId: entityId
        });
    }

    async processResponse(
        data: ExecuteActionResDTO,
        meta: {
            action: string,
            entityId: string
        }
    ): Promise<ExecuteActionResDTO> {

        const isFile = !!data?.response_data?.file;
        if(isFile) {
            const fileData = data.response_data.file;
            const {name, content} = fileData as {name: string, content: string};
            const file_name_prefix = `${meta.action}_${meta.entityId}_${Date.now()}`;
            const filePath = saveFile(file_name_prefix, content);   

            delete data.response_data.file
 
            return {
                ...data,
                response_data: {
                    ...data.response_data,
                    file_uri_path: filePath
                }
            }    
        }

        return data;
    }

    async execute_action(
        action: string,
        // this need to improve
        params: Record<string, any>,
        entityId: string = "default"
    ): Promise<Record<string, any>> {
        logger.warn("execute_action is deprecated, use executeAction instead");
        return this.executeAction(action, params, entityId);
    }
}
