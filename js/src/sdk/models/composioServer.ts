import { CancelablePromise, GetActiveTriggerData, GetActiveTriggerResponse, ListActiveTriggersData, ListActiveTriggersResponse, PatchUpdateActiveTriggerStatusData, PatchUpdateActiveTriggerStatusResponse, getActiveTrigger, listActiveTriggers, updateActiveTriggerStatus } from "../client";
import { Composio } from "../";
import axios from "axios";

export class ComposioServer {
    static async getAction(actionName: string): Promise<any> {
        return axios.get(`http://localhost:8123/api/actions/${actionName}`).then((res) => res.data?.data).catch((err) => {
            return null;
        });
    }
}