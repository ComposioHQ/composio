import { SessionGetInfoResponse } from "@composio/client/resources/auth/session";
import { InstrumentedInstance } from "../types/telemetry.types";
import ComposioSDK from "@composio/client";


export class Session implements InstrumentedInstance {
    readonly FILE_NAME: string = "core/models/Session.ts";
    private client: ComposioSDK;

    constructor(client: ComposioSDK) {
        this.client = client;
    }

    /**
     * Get the active session info
     * @returns {Promise<SessionGetInfoResponse>} Session info
     */
    async getInfo(): Promise<SessionGetInfoResponse> {
        return this.client.auth.session.getInfo();
    }
}