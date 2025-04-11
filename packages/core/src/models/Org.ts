import ComposioSDK from "@composio/client";

export class Org {
    private client: ComposioSDK;
    
    constructor(client: any) {
        this.client = client;
    }
    
    async getAPIKey() {
        return this.client.org.apiKey.retrieve();
    }

    async reGenerateAPIKey() {
        return this.client.org.apiKey.regenerate();
    }
   
}