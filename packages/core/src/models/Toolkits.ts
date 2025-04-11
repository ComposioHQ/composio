import ComposioSDK from "@composio/client";

export class Toolkits {
    private client: ComposioSDK;

    constructor(client: ComposioSDK) {
        this.client = client;
    }

    async list() {
        return this.client.toolkits.list();
    }

    async get(toolkitId: string) {
        return this.client.toolkits.retrieve(toolkitId);
    }

    async listCategories() {
        return this.client.toolkits.retrieveCategories();
    }
}