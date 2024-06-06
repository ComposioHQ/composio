import axios, { AxiosInstance } from 'axios';
import { ConnectedAccounts } from './models/connectedAccounts';
import { Apps } from './models/apps';
import { Actions } from './models/actions';
import { Triggers } from './models/triggers';
import { Integrations } from './models/integrations';
import { ActiveTriggers } from './models/activeTriggers';

export class Composio {
    private apiKey: string;
    private baseUrl: string;
    private http: AxiosInstance;


    connectedAccounts: ConnectedAccounts;
    apps: Apps;
    actions: Actions;
    triggers: Triggers;
    integrations: Integrations;
    activeTriggers: ActiveTriggers;

    constructor(apiKey?: string, baseUrl?: string) {
        this.apiKey = apiKey || process.env.ENV_COMPOSIO_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('API key is missing');
        }

        this.baseUrl = baseUrl || this.getApiUrlBase();
        this.http = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            }
        });

        this.connectedAccounts = new ConnectedAccounts(this);
        this.apps = new Apps(this);
        this.actions = new Actions(this);
        this.triggers = new Triggers(this);
        this.integrations = new Integrations(this);
        this.activeTriggers = new ActiveTriggers(this);
    }

    private getApiUrlBase(): string {
        return 'https://backend.composio.dev/api';
    }

    static async generateAuthKey(baseUrl?: string): Promise<string> {
        const http = axios.create({
            baseURL: baseUrl || 'https://backend.composio.dev/api',
            headers: {
                'Authorization': ''
            }
        });
        const response = await http.get('/v1/cli/generate_cli_session');
        if (response.status !== 200) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        return response.data.key;
    }

    static async validateAuthSession(key: string, code: string, baseUrl?: string): Promise<string> {
        const http = axios.create({
            baseURL: baseUrl || 'https://backend.composio.dev/api',
            headers: {
                'Authorization': ''
            }
        });
        const response = await http.get(`/v1/cli/verify_cli_code`, {
            params: { key, code }
        });
        if (response.status !== 200) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        return response.data.apiKey;
    }

    getEntity(id: string = 'default'): Entity {
        return new Entity(this, id);
    }
}

class Entity {
    private client: Composio;
    private id: string;

    constructor(client: Composio, id: string = 'DEFAULT_ENTITY_ID') {
        this.client = client;
        this.id = id;
    }

    // async execute(action: Action, params: Record<string, any>, connectedAccountId?: string): Promise<Record<string, any>> {
    //     if (action.noAuth) {
    //         return this.client.actions.execute(action, params, this.id);
    //     }

    //     const connectedAccount = await this.getConnection(action.app, connectedAccountId);
    //     return this.client.actions.execute(action, params, connectedAccount.clientUniqueUserId, connectedAccount.id);
    // }

    // async getConnection(app?: string, connectedAccountId?: string): Promise<ConnectedAccountModel> {
    //     if (connectedAccountId) {
    //         return this.client.connectedAccounts.get(connectedAccountId);
    //     }

    //     let latestAccount = null;
    //     let latestCreationDate = new Date(0);
    //     const connectedAccounts = await this.client.connectedAccounts.get({ entityIds: [this.id], active: true });

    //     for (const connectedAccount of connectedAccounts) {
    //         if (app === connectedAccount.appUniqueId) {
    //             const creationDate = new Date(connectedAccount.createdAt);
    //             if (!latestAccount || creationDate > latestCreationDate) {
    //                 latestCreationDate = creationDate;
    //                 latestAccount = connectedAccount;
    //             }
    //         }
    //     }

    //     if (!latestAccount) {
    //         throw new Error(`Could not find a connection with app='${app}', connected_account_id='${connectedAccountId}' and entity='${this.id}'`);
    //     }

    //     return latestAccount;
    // }

    // async initiateConnection(appName: string | App, authMode?: string, authConfig?: Record<string, any>, redirectUrl?: string, integration?: IntegrationModel): Promise<ConnectionRequestModel> {
    //     if (typeof appName !== 'string') {
    //         appName = appName.value;
    //     }

    //     const app = await this.client.apps.get(appName);
    //     const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
    //     if (!integration && authMode) {
    //         integration = await this.client.integrations.create({
    //             appId: app.appId,
    //             name: `integration_${timestamp}`,
    //             authMode,
    //             authConfig,
    //             useComposioAuth: false
    //         });
    //     }

    //     if (!integration && !authMode) {
    //         integration = await this.client.integrations.create({
    //             appId: app.appId,
    //             name: `integration_${timestamp}`,
    //             useComposioAuth: true
    //         });
    //     }

    //     return this.client.connectedAccounts.initiate({
    //         integrationId: integration.id,
    //         entityId: this.id,
    //         redirectUrl
    //     });
    // }
}

// Define other classes like ConnectedAccounts, Apps, Actions, Triggers, Integrations, ActiveTriggers, Action, ConnectedAccountModel, IntegrationModel, ConnectionRequestModel as needed.
