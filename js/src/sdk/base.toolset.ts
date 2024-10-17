import { Composio } from "../sdk";
import { ExecEnv, WorkspaceFactory } from "../env/factory";
import { COMPOSIO_BASE_URL } from "./client/core/OpenAPI";
import { RemoteWorkspace } from "../env/base";
import type { IPythonActionDetails, Optional, Sequence } from "./types";
import { getEnvVariable } from "../utils/shared";
import { WorkspaceConfig } from "../env/config";
import { Workspace } from "../env";
import logger from "../utils/logger";
import axios from "axios";
import { AppConnectorControllerGetConnectorInfoResponse, ExecuteActionResDTO } from "./client/types.gen";
import {  saveFile } from "./utils/fileUtils";
import { convertReqParams, converReqParamForActionExecution } from "./utils";

type GetListActionsResponse = any;
class UserData {
    apiKey: string | undefined;
    constructor(public _path: string) {
    }

    init() {
       try {
            const module = require(this._path);
            this.apiKey = module.apiKey;
       } catch {
            return false;
       }
    }

    static load(_path: string) { 
        return new UserData(_path);
    }
}

const getUserPath = () => {
    try{
        const path = require("path");
        return path.join(getEnvVariable("HOME", ""), ".composio", "userData.json");
    } catch {
       return null;
    }
    
}

export class ComposioToolSet {
    client: Composio;
    apiKey: string;
    runtime: string | null;
    entityId: string;
    workspace: WorkspaceFactory;
    workspaceEnv: ExecEnv;

    localActions: IPythonActionDetails["data"] | undefined;

    constructor(
        apiKey: string | null,
        baseUrl: string | null = COMPOSIO_BASE_URL,
        runtime: string | null = null,
        entityId: string = "default",
        workspaceConfig: WorkspaceConfig = Workspace.Host()
    ) {  
        const clientApiKey: string | undefined = apiKey || getEnvVariable("COMPOSIO_API_KEY") || UserData.load(getUserPath()).apiKey;
        if (!clientApiKey) {
            throw new Error("API key is required, please pass it either by using `COMPOSIO_API_KEY` environment variable or during initialization");
        }
        this.apiKey = clientApiKey;
        this.client = new Composio(this.apiKey, baseUrl || undefined, runtime as string );
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
        app: string | null = null,
        integrationId: string | null = null,
        entityId: string | null = null
    ): Promise<AppConnectorControllerGetConnectorInfoResponse["expectedInputFields"]> {
        if (integrationId === null && app === null) {
            throw new Error(
                "Both `integration_id` and `app` cannot be None"
            );
        }

        if (integrationId === null) {
            try {
                const integrations = await this.client.integrations.list({
                    appName: app!,
                    showDisabled: false
                })
                integrationId = (integrations?.items[0] as any)?.integrationId;
            } catch (e) {
                throw new Error(
                    `No existing integration found for \`${String(app)}\`, ` +
                    "Please create an integration and use the ID to " +
                    "initiate connection."
                );
            }
        }

        const out =  (await this.client.integrations.get({
            integrationId: integrationId!
        }));
        if(!out) {
            throw new Error(
                `No existing integration found for \`${String(integrationId)}\`, ` +
                "Please create an integration and use the ID to " +
                "initiate connection."
            );
        }
        return out.expectedInputFields;
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

        const toolsActions = [...actions!, ...uniqueLocalActions];

        return toolsActions.map((action: any) => {
            return this.modifyActionForLocalExecution(action);
        });
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
        const toolsActions = [...apps.items!, ...uniqueLocalActions];
        
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

    async executeAction(
        action: string,
        params: Record<string, any>,
        entityId: string = "default"
    ): Promise<Record<string, any>> {
        if(this.workspaceEnv && this.workspaceEnv !== ExecEnv.HOST) {
            const workspace = await this.workspace.get();
            return workspace.executeAction(action, params, {
                entityId: this.entityId
            });
        }
        params = await converReqParamForActionExecution(params);
        const data =  await this.client.getEntity(entityId).execute(action, params);

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
