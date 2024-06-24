import axios, { AxiosInstance } from 'axios';
import { ConnectedAccounts, ConnectionRequest } from './models/connectedAccounts';
import { Apps } from './models/apps';
import { Actions } from './models/actions';
import { Triggers } from './models/triggers';
import { Integrations } from './models/integrations';
import { ActiveTriggers } from './models/activeTriggers';
import { AuthScheme, GetConnectedAccountResponse, ListActiveTriggersResponse, ListAllConnectionsResponse, OpenAPI, PatchUpdateActiveTriggerStatusResponse, SetupTriggerResponse } from './client';

export class Composio {
    public apiKey: string;
    public baseUrl: string;
    private http: AxiosInstance;


    connectedAccounts: ConnectedAccounts;
    apps: Apps;
    actions: Actions;
    triggers: Triggers;
    integrations: Integrations;
    activeTriggers: ActiveTriggers;
    config: typeof OpenAPI;

    constructor(apiKey?: string, baseUrl?: string, runtime?: string) {
        this.apiKey = apiKey || process.env.ENV_COMPOSIO_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('API key is missing');
        }

        this.baseUrl = baseUrl || this.getApiUrlBase();
        this.http = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'X-API-KEY': `${this.apiKey}`,
                'X-SOURCE': 'js_sdk',
                'X-RUNTIME': runtime
            }
        });

        this.config = {
            ...OpenAPI,
            HEADERS: {
                'X-API-Key': `${this.apiKey}`
            }
        }

        this.connectedAccounts = new ConnectedAccounts(this);
        this.apps = new Apps(this);
        this.actions = new Actions(this);
        this.triggers = new Triggers(this);
        this.integrations = new Integrations(this);
        this.activeTriggers = new ActiveTriggers(this);

    }

    public async getClientId(): Promise<string> {
        const response = await this.http.get('/v1/client/auth/client_info',{
            headers: {
                'X-API-KEY': `${this.apiKey}`
            }
        });
        if (response.status !== 200) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        return response.data.client.id;
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

export class Entity {
    private client: Composio;
    id: string;

    constructor(client: Composio, id: string = 'DEFAULT_ENTITY_ID') {
        this.client = client;
        this.id = id;
    }

    async execute(actionName: string, params?: Record<string, any> | undefined, text?: string | undefined, connectedAccountId?: string): Promise<Record<string, any>> {
        const action = await this.client.actions.get({
            actionName: actionName
        });
        if (!action) {
            throw new Error("Could not find action: " + actionName);
        }
        const app = await this.client.apps.get({
            appKey: action.appKey!
        });
        if ((app.yaml as any).no_auth) {
            return this.client.actions.execute({
                actionName: actionName,
                requestBody: {
                    input: params,
                    appName: action.appKey
                }
            });
        }
        let connectedAccount = null;
        if(connectedAccountId) {
            connectedAccount = await this.client.connectedAccounts.get({
                connectedAccountId: connectedAccountId
            });
        } else {
            const connectedAccounts = await this.client.connectedAccounts.list({
                user_uuid: this.id
            });
            if (connectedAccounts.items!.length === 0) {
                throw new Error('No connected account found');
            }

            connectedAccount = connectedAccounts.items![0];
        }
        return this.client.actions.execute({
            actionName: actionName,
            requestBody: {
                connectedAccountId: connectedAccount.id,
                input: params,
                appName: action.appKey,
                text: text
            }
        });
    }

    async getConnection(app?: string, connectedAccountId?: string): Promise<GetConnectedAccountResponse | null> {
        if (connectedAccountId) {
            return await this.client.connectedAccounts.get({
                connectedAccountId
            });
        }

        let latestAccount = null;
        let latestCreationDate: Date | null = null;
        const connectedAccounts = await this.client.connectedAccounts.list({
            user_uuid: this.id,
        });

        if(!connectedAccounts.items || connectedAccounts.items.length === 0) {
            return null;
        }

        for (const connectedAccount of connectedAccounts.items!) {
            if (app === connectedAccount.appName) {
                const creationDate = new Date(connectedAccount.createdAt!);
                if ((!latestAccount || (latestCreationDate && creationDate > latestCreationDate)) && connectedAccount.status === "ACTIVE") {
                    latestCreationDate = creationDate;
                    latestAccount = connectedAccount;
                }
            }
        }

        if (!latestAccount) {
            return null;
        }

        return this.client.connectedAccounts.get({
            connectedAccountId: latestAccount.id!
        });
    }

    async setupTrigger(app: string, triggerName: string, config: { [key: string]: any }): Promise<SetupTriggerResponse> {
        /**
         * Enable a trigger for an entity.
         *
         * @param app App name
         * @param triggerName Trigger name
         * @param config Trigger config
         */
        const connectedAccount = await this.getConnection(app);
        if (!connectedAccount) {
            throw new Error(`Could not find a connection with app='${app}' and entity='${this.id}'`);
        }
        return this.client.triggers.setup({
            triggerName: triggerName,
            connectedAccountId: connectedAccount.id!,
            requestBody: {
                triggerConfig: config,
            }
        });
    }

    async disableTrigger(triggerId: string): Promise<PatchUpdateActiveTriggerStatusResponse> {
        /**
         * Disable a trigger for an entity.
         *
         * @param triggerId Trigger ID
         */
        return this.client.activeTriggers.disable({ triggerId: triggerId });
    }

    async getConnections(): Promise<ListAllConnectionsResponse["items"]> {
        /**
         * Get all connections for an entity.
         */
        const connectedAccounts = await this.client.connectedAccounts.list({
            user_uuid: this.id
        });
        return connectedAccounts.items!;
    }

    async getActiveTriggers(): Promise<ListActiveTriggersResponse["triggers"]> {
        /**
         * Get all active triggers for an entity.
         */
        const connectedAccounts = await this.getConnections();
        const activeTriggers = await this.client.activeTriggers.list({
            connectedAccountIds: connectedAccounts!.map(account => account.id!).join(",")
        });
        return activeTriggers.triggers!;
    }

    async initiateConnection(
        appName: string,
        authMode?: AuthScheme,
        authConfig?: { [key: string]: any },
        redirectUrl?: string,
        integrationId?: string
    ): Promise<ConnectionRequest> {

        // Get the app details from the client
        const app = await this.client.apps.get({ appKey: appName });
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

        let integration = integrationId ? await this.client.integrations.get({ integrationId: integrationId }) : null;
        // Create a new integration if not provided
        if (!integration && authMode) {
            integration = await this.client.integrations.create({
                appId: app.appId!,
                name: `integration_${timestamp}`,
                authScheme: authMode,
                authConfig: authConfig,
                useComposioAuth: false,
            });
        }

        if (!integration && !authMode) {
            integration = await this.client.integrations.create({
                appId: app.appId!,
                name: `integration_${timestamp}`,
                useComposioAuth: true,
            });
        }

        // Initiate the connection process
        return this.client.connectedAccounts.initiate({
            integrationId: integration!.id!,
            userUuid: this.id,
            redirectUri: redirectUrl,
        });
    }
}
