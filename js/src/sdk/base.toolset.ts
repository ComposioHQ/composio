import { Composio } from "../sdk";
import { ExecEnv, WorkspaceFactory } from "../env/factory";
import { COMPOSIO_BASE_URL } from "./client/core/OpenAPI";
import { RemoteWorkspace } from "../env/base";
import type { IPythonActionDetails, Optional, Sequence } from "./types";
// import { GetListActionsResponse } from "./client";
import { getEnvVariable } from "../utils/shared";
import { WorkspaceConfig } from "../env/config";
import { Workspace } from "../env";
import logger from "../utils/logger";

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
        return [...actions!, ...uniqueLocalActions];
    }

    async getToolsSchema(
        filters: {
            apps: Sequence<string>;
            tags?: Optional<Array<string>>;
            useCase?: Optional<string>;
        },
        entityId?: Optional<string>
    ): Promise<Sequence<NonNullable<GetListActionsResponse["items"]>[0]>> {
        await this.setup();

        const apps =  await this.client.actions.list({
            apps: filters.apps.join(","),
            tags: filters.tags?.join(","),
            showAll: true,
            filterImportantActions: !filters.tags && !filters.useCase,
            useCase: filters.useCase || undefined
         });
        const localActions = new Map<string, NonNullable<GetListActionsResponse["items"]>[0]>();
        for (const appName of filters.apps!) {
            const actionData = this.localActions?.filter((a: any) => a.appName === appName);
            if(actionData) {
                for (const action of actionData) {
                    localActions.set(action.name, action);
                }
            }
        }
        const uniqueLocalActions = Array.from(localActions.values());
        const toolsActions = [...apps.items!, ...uniqueLocalActions];
        return toolsActions;
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
        return this.client.getEntity(entityId).execute(action, params);
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
