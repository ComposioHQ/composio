import apiClient from "../client/client"

type CancelablePromise<T> = Promise<T> & {
  cancel: () => void;
}
export type GetAppData = {
    appKey: string;
};
type GetAppResponse = any
type ListAllAppsResponse = any

export class Apps {
    constructor() {}

    /**
     * Retrieves a list of all available apps in the Composio platform.
     * 
     * This method allows clients to explore and discover the supported apps. It returns an array of app objects, each containing essential details such as the app's key, name, description, logo, categories, and unique identifier.
     * 
     * @returns {Promise<ListAllAppsResponse>} A promise that resolves to the list of all apps.
     * @throws {ApiError} If the request fails.
     */
    list(): CancelablePromise<ListAllAppsResponse> {
        //@ts-ignore
        return apiClient.apps.getApps()
    }

    /**
     * Retrieves details of a specific app in the Composio platform.
     * 
     * This method allows clients to fetch detailed information about a specific app by providing its unique key. The response includes the app's name, key, status, description, logo, categories, authentication schemes, and other metadata.
     * 
     * @param {GetAppData} data The data for the request, including the app's unique key.
     * @returns {CancelablePromise<GetAppResponse>} A promise that resolves to the details of the app.
     * @throws {ApiError} If the request fails.
     */
    get(data: GetAppData): CancelablePromise<GetAppResponse> {
        //@ts-ignore
        return apiClient.apps.getApp({
            path:{
                appName: data.appKey
            }
        })
    }
}

