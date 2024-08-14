import { ConnectionRequest } from "./connectedAccounts";
import {Actions} from "./actions"
import { Apps } from "./apps";
import { Integrations } from "./integrations";
import { ActiveTriggers } from "./activeTriggers";
import { ConnectedAccounts } from "./connectedAccounts";
import { ExecuteActionResDTO } from "../client";


export class Entity {
    id: string;

    constructor(id: string = 'DEFAULT_ENTITY_ID') {
        this.id = id;
    }

    async execute(actionName: string, params?: Record<string, any> | undefined, text?: string | undefined, connectedAccountId?: string): Promise<ExecuteActionResDTO> {
        const action = await Actions.get({
            actionName: actionName
        });
        if (!action) {
            throw new Error("Could not find action: " + actionName);
        }
        const app = await Apps.get({
            appKey: action.appKey!
        });
        if ((app.yaml as any).no_auth) {
            return Actions.execute({
                actionName: actionName,
                requestBody: {
                    input: params,
                    appName: action.appKey
                }
            });
        }
        let connectedAccount = null;
        if (connectedAccountId) {
            connectedAccount = await ConnectedAccounts.get({
                connectedAccountId: connectedAccountId
            });
        } else {
            const connectedAccounts = await ConnectedAccounts.list({
                user_uuid: this.id,
                appNames: [action.appKey!],
                status: 'ACTIVE'
            });
            if (connectedAccounts.items!.length === 0) {
                throw new Error('No connected account found');
            }

            connectedAccount = connectedAccounts.items![0];
        }
        return Actions.execute({
            actionName: actionName,
            requestBody: {
                connectedAccountId: connectedAccount.id,
                input: params,
                appName: action.appKey,
                text: text
            }
        });
    }

    async getConnection(app?: string, connectedAccountId?: string): Promise<any | null> {
        if (connectedAccountId) {
            return await ConnectedAccounts.get({
                connectedAccountId
            });
        }

        let latestAccount = null;
        let latestCreationDate: Date | null = null;
        const connectedAccounts = await ConnectedAccounts.list({
            user_uuid: this.id,
        });

        console.log(connectedAccountId)
        if (!connectedAccounts.items || connectedAccounts.items.length === 0) {
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

        return ConnectedAccounts.get({
            connectedAccountId: latestAccount.id!
        });
    }

    async setupTrigger(app: string, triggerName: string, config: { [key: string]: any; }): Promise<any> {
        const connectedAccount = await this.getConnection(app);
        if (!connectedAccount) {
            throw new Error(`Could not find a connection with app='${app}' and entity='${this.id}'`);
        }
    }

    async disableTrigger(triggerId: string): Promise<any> {
        return ActiveTriggers.disable({ triggerId: triggerId });
    }

    //@ts-ignore
    async getConnections(): Promise<any> {
        /**
         * Get all connections for an entity.
         */
        const connectedAccounts = await ConnectedAccounts.list({
            user_uuid: this.id
        });
        return connectedAccounts.items!;
    }

    async getActiveTriggers(): Promise<any> {
        /**
         * Get all active triggers for an entity.
         */
        const connectedAccounts = await this.getConnections();
        const activeTriggers = await ActiveTriggers.list({
            // connectedAccountIds: connectedAccounts!.map(account => account.id!).join(",")
        });
        return activeTriggers.triggers!;
    }

    async initiateConnection(
        appName: string,
        authMode?: any,
        authConfig?: { [key: string]: any; },
        redirectUrl?: string,
        integrationId?: string
    ): Promise<ConnectionRequest> {

        // Get the app details from the client
        const app = await Apps.get({ appKey: appName });
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

        let integration = integrationId ? await Integrations.get({ integrationId: integrationId }) : null;
        // Create a new integration if not provided
        if (!integration && authMode) {
            integration = await Integrations.create({
                appId: app.appId!,
                name: `integration_${timestamp}`,
                authScheme: authMode,
                authConfig: authConfig,
                useComposioAuth: false,
            });
        }

        if (!integration && !authMode) {
            integration = await Integrations.create({
                appId: app.appId!,
                name: `integration_${timestamp}`,
                useComposioAuth: true,
            });
        }
        
        // Initiate the connection process
        return ConnectedAccounts.initiate({
            integrationId: integration!.id!,
            userUuid: this.id,
            redirectUri: redirectUrl,
        });
    }
}
