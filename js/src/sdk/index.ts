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
    public apiKey: string;
    public baseUrl: string;

    connectedAccounts: ConnectedAccounts;
    apps: Apps;
    actions: Actions;
    triggers: Triggers;
    integrations: Integrations;
    activeTriggers: ActiveTriggers;
    // config: typeof OpenAPI;

    constructor(apiKey?: string, baseUrl?: string, runtime?: string) {
        this.apiKey = apiKey || getEnvVariable("COMPOSIO_API_KEY") || '';
        if (!this.apiKey) {
            throw new Error('API key is missing');
        }
        this.baseUrl = baseUrl || getEnvVariable("COMPOSIO_BASE_URL", COMPOSIO_BASE_URL) || "";
        User.baseUrl = this.baseUrl;
        User.apiKey = this.apiKey;
        axiosClient.setConfig({
            baseURL: baseUrl,
            headers: {
                'X-API-KEY': `${this.apiKey}`,
                'X-SOURCE': 'js_sdk',
                'X-RUNTIME': runtime
            }
        })
  
        this.connectedAccounts = new ConnectedAccounts();
        this.apps = new Apps();
        this.actions = new Actions();
        this.triggers = new Triggers();
        this.integrations = new Integrations();
        this.activeTriggers = new ActiveTriggers();

    }

    getEntity(id: string = 'default'): Entity {
        return new Entity(id);
    }
}

