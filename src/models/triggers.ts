import { CancelablePromise, ListTriggersData, ListTriggersResponse, listTriggers } from "../client";
import { Composio } from "../sdk";

export class Triggers {
    constructor(private client: Composio) {
        this.client = client;
    }
    /**
     * Retrieves a list of all triggers in the Composio platform.
     * 
     * This method allows you to fetch a list of all the available triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
     * 
     * @param {ListTriggersData} data The data for the request.
     * @returns {CancelablePromise<ListTriggersResponse>} A promise that resolves to the list of all triggers.
     * @throws {ApiError} If the request fails.
     */
    list(data: ListTriggersData = {}): CancelablePromise<ListTriggersResponse> {
        return listTriggers(data);
    }
}
