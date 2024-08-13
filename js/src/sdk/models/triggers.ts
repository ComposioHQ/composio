
import { TriggerData, PusherUtils } from "../utils/pusher";
import logger from "../../utils/logger";
import {User} from "./user"

//@ts-ignore
import {  TriggersService } from '../client/index';
export class Triggers extends TriggersService  {
    trigger_to_client_event = "trigger_to_client";

    /**
     * Retrieves a list of all triggers in the Composio platform.
     * 
     * This method allows you to fetch a list of all the available triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
     * 
     * @param {ListTriggersData} data The data for the request.
     * @returns {CancelablePromise<ListTriggersResponse>} A promise that resolves to the list of all triggers.
     * @throws {ApiError} If the request fails.
     */
    //@ts-ignore
    static list(data: ListTriggersData = {}): CancelablePromise<ListTriggersResponse> {
        //@ts-ignore
        return listTriggers(data, this.client.config);
    }

    /**
     * Setup a trigger for a connected account.
     * 
     * @param {SetupTriggerData} data The data for the request.
     * @returns {CancelablePromise<SetupTriggerResponse>} A promise that resolves to the setup trigger response.
     * @throws {ApiError} If the request fails.
     */
    //@ts-ignore
    static setup(data: any): CancelablePromise<SetupTriggerResponse> {
        //@ts-ignore
        return setupTrigger(data, this.client.config);
    }

    static async subscribe(fn: (data: TriggerData) => void, filters:{
        appName?: string,
        triggerId?  : string;
        connectionId?: string;
        integrationId?: string;
        triggerName?: string;
        triggerData?: string;
        entityId?: string;
    }={}) {

        if(!fn) throw new Error("Function is required for trigger subscription");
        //@ts-ignore
        const clientId = await User.getClientId();
        //@ts-ignore
        await PusherUtils.getPusherClient(User.baseUrl, User.apiKey);

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
        
        logger.info("Subscribing to triggers",filters)
        PusherUtils.triggerSubscribe(clientId, (data: TriggerData) => {
            if (shouldSendTrigger(data)) {
                fn(data);
            }
        });
    }

    static async unsubscribe() {
        //@ts-ignore
        const clientId = await User.getClientId();
        PusherUtils.triggerUnsubscribe(clientId);
    }
}

