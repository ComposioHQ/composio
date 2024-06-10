import { Composio } from "../sdk";
import * as path from "path";
import { Action } from "./enums";

class UserData {
    apiKey: string;
    constructor(public _path: string) {
        this.apiKey = require(path.join(_path)).apiKey;
    }

    static load(_path: string) {
        return new UserData(_path);
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
        this.apiKey = apiKey || process.env["COMPOSIO_API_KEY"] || UserData.load(path.join(process.env.HOME || "", ".composio", "userData.json")).apiKey;
        if (!this.apiKey) {
            throw new Error("API key is required");
        }
        this.client = new Composio(this.apiKey, baseUrl || undefined);
        this.runtime = runtime;
        this.entityId = entityId;
    }

    async execute_action(
        action: Action | string,
        params: Record<string, any>,
        entityId: string = "default"
    ): Promise<Record<string, any>> {
        if (typeof action === "string") {
            // @ts-ignore
            action = Action[action as keyof typeof Action];
        }
        return this.client.getEntity(entityId).execute(action as Action, params);
    }
}
