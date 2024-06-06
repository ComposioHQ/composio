import { CancelablePromise, ListAllAppsResponse, listAllApps } from "../client";
import { Composio } from "../sdk"

export class Apps {
    constructor(private readonly client: Composio) {
        this.client = client;
    }

    /**
     * Retrieves a list of all available apps in the Composio platform.
     * 
     * This method allows clients to explore and discover the supported apps. It returns an array of app objects, each containing essential details such as the app's key, name, description, logo, categories, and unique identifier.
     * 
     * @returns {Promise<ListAllAppsResponse>} A promise that resolves to the list of all apps.
     * @throws {ApiError} If the request fails.
     */
    list(): CancelablePromise<ListAllAppsResponse> {
        return listAllApps(this.client.config);
    }
}

