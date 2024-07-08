import { CancelablePromise, ListTriggersData, ListTriggersResponse, SetupTriggerData, SetupTriggerResponse, listTriggers, setupTrigger } from "../client";
import { Composio } from "../";
import { TriggerData, PusherUtils } from "../utils/pusher";

export class Triggers {
    trigger_to_client_event = "trigger_to_client";

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
        return listTriggers(data, this.client.config);
    }

    /**
     * Setup a trigger for a connected account.
     * 
     * @param {SetupTriggerData} data The data for the request.
     * @returns {CancelablePromise<SetupTriggerResponse>} A promise that resolves to the setup trigger response.
     * @throws {ApiError} If the request fails.
     */
    setup(data: SetupTriggerData): CancelablePromise<SetupTriggerResponse> {
        return setupTrigger(data, this.client.config);
    }

    async subscribe(fn: (data: TriggerData) => void, filters:{
        appName?: string,
        triggerId?  : string;
        connectionId?: string;
        integrationId?: string;
        triggerName?: string;
        triggerData?: string;
        entityId?: string;
    }={}) {

        if(!fn) throw new Error("Function is required for trigger subscription");

        const clientId = await this.client.getClientId();
        await PusherUtils.getPusherClient(this.client.baseUrl, this.client.apiKey);

        const shouldSendTrigger = (data: TriggerData) => {
           if(Object.keys(filters).length === 0) return true;
            else{
                return (
                    (!filters.appName || data.appName === filters.appName) &&
                    (!filters.triggerId || data.metadata.id === filters.triggerId) &&
                    (!filters.connectionId || data.metadata.connectionId === filters.connectionId) &&
                    (!filters.triggerName || data.metadata.triggerName === filters.triggerName) &&
                    (!filters.entityId || data.metadata.connection.clientUniqueUserId === filters.entityId) &&
                    (!filters.integrationId || data.metadata.connection.integrationId === filters.integrationId)
                );
            }
        }
        
        console.log("Subscribing to triggers",filters)
        PusherUtils.triggerSubscribe(clientId, (data: TriggerData) => {
            if (shouldSendTrigger(data)) {
                fn(data);
            }
        });
    }

    async unsubscribe() {
        const clientId = await this.client.getClientId();
        PusherUtils.triggerUnsubscribe(clientId);
    }
}

