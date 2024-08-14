import { ConnectedAccounts } from './models/connectedAccounts';
import { Apps } from './models/apps';
import { Actions } from './models/actions';
import { Triggers } from './models/triggers';
import { Integrations } from './models/integrations';
import { ActiveTriggers } from './models/activeTriggers';
import { getEnvVariable } from '../utils/shared';
import { COMPOSIO_BASE_URL } from './client/core/OpenAPI';
import { client as axiosClient } from "./client/services.gen"
import { User } from './models/user';
import { Entity } from './models/Entity';

export class Composio {

    connectedAccounts: typeof ConnectedAccounts;
    apps: typeof Apps;
    actions: typeof Actions;
    triggers: typeof Triggers;
    integrations: typeof Integrations;
    activeTriggers: typeof ActiveTriggers;

    constructor(apiKey?: string, baseUrl?: string, runtime?: string) {
        User.baseUrl = baseUrl || getEnvVariable("COMPOSIO_BASE_URL", COMPOSIO_BASE_URL) || "";
        User.apiKey = apiKey || getEnvVariable("COMPOSIO_API_KEY") || '';

        if (!User.apiKey) {
            throw new Error('API key is missing');
        }
 
        axiosClient.setConfig({
            baseURL: baseUrl,
            headers: {
                'X-API-KEY': `${User.apiKey}`,
                'X-SOURCE': 'js_sdk',
                'X-RUNTIME': runtime
            }
        })
  
        this.connectedAccounts = ConnectedAccounts;
        this.apps = Apps;
        this.actions = Actions;
        this.triggers = Triggers;
        this.integrations = Integrations;
        this.activeTriggers = ActiveTriggers;

    }

    getEntity(id: string = 'default'): Entity {
        return new Entity(id);
    }
}

