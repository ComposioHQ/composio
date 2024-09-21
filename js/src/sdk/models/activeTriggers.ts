import apiClient from "../client/client"
import { BackendClient } from "./backendClient";

export class ActiveTriggers {

    backendClient: BackendClient;

    constructor(backendClient: BackendClient) {
        this.backendClient = backendClient;
    }
    /**
     * Retrieves details of a specific active trigger in the Composio platform by providing its trigger name.
     * 
     * The response includes the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
     * 
     * @param {GetActiveTriggerData} data The data for the request.
     * @returns {CancelablePromise<GetActiveTriggerResponse>} A promise that resolves to the details of the active trigger.
     * @throws {ApiError} If the request fails.
     */
     get(data: any): any {
        //@ts-ignore
        return apiClient.triggers.getTrigger(data).then(res => res.data)
    }

    /**
     * Retrieves a list of all active triggers in the Composio platform.
     * 
     * This method allows you to fetch a list of all the available active triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
     * 
     * @param {ListActiveTriggersData} data The data for the request.
     * @returns {CancelablePromise<ListActiveTriggersResponse>} A promise that resolves to the list of all active triggers.
     * @throws {ApiError} If the request fails.
     */
     list(data: any = {}): any {
        return apiClient.triggers.getActiveTriggers({
            query: data
        }).then(res => (res.data as Record<string,string>).triggers)
    }

    /**
     * Enables the previously disabled trigger.
     * 
     * @param {Object} data The data for the request.
     * @param {string} data.triggerId Id of the trigger
     * @returns {CancelablePromise<Record<string, any>>} A promise that resolves to the response of the enable request.
     * @throws {ApiError} If the request fails.
     */
    enable(data: {triggerId: any}): any {
        return apiClient.triggers.switchTriggerInstanceStatus({
            path: data,
            body:{
                enabled: true
            }
        }).then(res => res.data)
    }

    static disable(data: {triggerId: any}): any {
        return apiClient.triggers.switchTriggerInstanceStatus({
            path: data,
            body: {
                enabled: false
            }
        }).then(res => res.data)
    }
}
