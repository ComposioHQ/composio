import { Composio } from "../sdk";
import { LocalActions } from "../utils/localTools";
import { ExecEnv, WorkspaceFactory } from "../env/factory";
import { COMPOSIO_BASE_URL } from "./client/core/OpenAPI";

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
        return path.join(process.env.HOME || "", ".composio", "userData.json");
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

    constructor(
        apiKey: string | null,
        baseUrl: string | null = COMPOSIO_BASE_URL,
        runtime: string | null = null,
        entityId: string = "default",
        workspaceEnv: ExecEnv = ExecEnv.HOST
    ) {  
        const clientApiKey: string | undefined = apiKey || process.env["COMPOSIO_API_KEY"] || UserData.load(getUserPath()).apiKey;
        if (!clientApiKey) {
            throw new Error("API key is required, please pass it either by using `COMPOSIO_API_KEY` environment variable or during initialization");
        }
        this.apiKey = clientApiKey;
        this.client = new Composio(this.apiKey, baseUrl || undefined, runtime as string );
        this.runtime = runtime;
        this.entityId = entityId;
        this.workspace = new WorkspaceFactory(
            workspaceEnv,
            {
                composioAPIKey: this.apiKey,
                composioBaseURL: baseUrl,
            }
        )
        this.workspaceEnv = workspaceEnv;

        process.on("exit", async () => {
            await this.workspace.workspace?.teardown();
        });
    }

    async setup() {
        await this.workspace.new(this.workspaceEnv, {
            composioAPIKey: this.apiKey,
            composioBaseURL: COMPOSIO_BASE_URL,
        });
    }

    async execute_action(
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
}
