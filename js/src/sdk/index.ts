import { ConnectedAccounts } from './models/connectedAccounts';
import { Apps } from './models/apps';
import { Actions } from './models/actions';
import { Triggers } from './models/triggers';
import { Integrations } from './models/integrations';
import { ActiveTriggers } from './models/activeTriggers';
import { getEnvVariable } from '../utils/shared';
import { COMPOSIO_BASE_URL } from './client/core/OpenAPI';
import { BackendClient } from './models/backendClient';
import { Entity } from './models/Entity';

export class Composio {
    connectedAccounts: ConnectedAccounts;
    apps:  Apps;
    actions:  Actions;
    triggers:  Triggers;
    integrations:  Integrations;
    activeTriggers:  ActiveTriggers;

    backendClient: BackendClient;

    constructor(apiKey?: string, baseUrl?: string, runtime?: string) {
        const baseURLParsed = baseUrl || getEnvVariable("COMPOSIO_BASE_URL", COMPOSIO_BASE_URL) || "https://backend.composio.dev";
        const apiKeyParsed = apiKey || getEnvVariable("COMPOSIO_API_KEY") || '';
 
        this.backendClient = new BackendClient(apiKeyParsed, baseURLParsed, runtime);
        this.connectedAccounts = new ConnectedAccounts(this.backendClient);
        this.triggers = new Triggers(this.backendClient);
        
        this.apps = new Apps();
        this.actions = new Actions();

        this.integrations = new Integrations();
        this.activeTriggers = new ActiveTriggers();

    }

    getEntity(id: string = 'default'): Entity {
        return new Entity(id);
    }
}

