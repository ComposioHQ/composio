import { Composio } from "../sdk";
import { getEnvVariable } from "../utils/shared";

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

    constructor(
        apiKey: string | null,
        baseUrl: string | null = null,
        runtime: string | null = null,
        entityId: string = "default"
    ) {  
        const clientApiKey: string | undefined = apiKey || getEnvVariable("COMPOSIO_API_KEY") || UserData.load(getUserPath()).apiKey;
        if (!clientApiKey) {
            throw new Error("API key is required, please pass it either by using `COMPOSIO_API_KEY` environment variable or during initialization");
        }
        this.apiKey = clientApiKey;
        this.client = new Composio(this.apiKey, baseUrl || undefined, runtime as string );
        this.runtime = runtime;
        this.entityId = entityId;
    }

    async execute_action(
        action: string,
        params: Record<string, any>,
        entityId: string = "default"
    ): Promise<Record<string, any>> {
        return this.client.getEntity(entityId).execute(action, params);
    }
}
