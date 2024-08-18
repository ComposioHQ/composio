
import { TriggerData, PusherUtils } from "../utils/pusher";
import logger from "../../utils/logger";
import {BackendClient} from "./backendClient"

import apiClient from "../client/client"
import { TriggersControllerListTriggersData, TriggersControllerListTriggersResponse } from "../client";

type RequiredQuery = TriggersControllerListTriggersData["query"];

export class Triggers {
    trigger_to_client_event = "trigger_to_client";

    backendClient: BackendClient;
    constructor(backendClient: BackendClient) {
        this.backendClient = backendClient;
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
    //@ts-ignore
    list(data?: RequiredQuery={} ): Promise<TriggersControllerListTriggersResponse> {
        //@ts-ignore
        return apiClient.triggers.listTriggers({
            query: {
                appNames: data?.appNames,
            }
        }).then(res => res.data)
    }

    /**
     * Setup a trigger for a connected account.
     * 
     * @param {SetupTriggerData} data The data for the request.
     * @returns {CancelablePromise<SetupTriggerResponse>} A promise that resolves to the setup trigger response.
     * @throws {ApiError} If the request fails.
     */
    //@ts-ignore
    async setup(connectedAccountId, triggerName, config: Record<string, any>):{status:"string",triggerId:string}{
        //@ts-ignore
        const {data,error} = await apiClient.triggers.enableTrigger({
            path:{
                connectedAccountId,
                triggerName
            },
            body: {
                triggerConfig: config
            }
        })

        return data as unknown as {status:"string",triggerId:string};
    }

    enable(data: { triggerId: any }): any {
        return apiClient.triggers.switchTriggerInstanceStatus({
            path: data,
            body: {
                enabled: true
            }
        }).then(res => res.data)
    }

    disable(data: { triggerId: any }): any {
        return apiClient.triggers.switchTriggerInstanceStatus({
            path: data,
            body: {
                enabled: false
            }
        }).then(res => res.data)
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
        //@ts-ignore
        const clientId = await this.backendClient.getClientId();
        //@ts-ignore
        await PusherUtils.getPusherClient(this.backendClient.baseUrl, this.backendClient.apiKey);

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

    async unsubscribe() {
        //@ts-ignore
        const clientId = await this.backendClient.getClientId();
        PusherUtils.triggerUnsubscribe(clientId);
    }
}

