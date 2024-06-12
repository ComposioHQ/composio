import { CancelablePromise, GetActiveTriggerData, GetActiveTriggerResponse, ListActiveTriggersData, ListActiveTriggersResponse, getActiveTrigger, listActiveTriggers } from "../client";
import { Composio } from "../";

export class ActiveTriggers {
    constructor(private readonly client: Composio) {
        this.client = client;
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
    get(data: GetActiveTriggerData): CancelablePromise<GetActiveTriggerResponse> {
        return getActiveTrigger(data, this.client.config);
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
    list(data: ListActiveTriggersData = {}): CancelablePromise<ListActiveTriggersResponse> {
        return listActiveTriggers(data, this.client.config);
    }
}
