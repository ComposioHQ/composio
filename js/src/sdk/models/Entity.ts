import { ConnectionRequest } from "./connectedAccounts";
import {Actions} from "./actions"
import { Apps } from "./apps";
import { Integrations } from "./integrations";
import { ActiveTriggers } from "./activeTriggers";
import { ConnectedAccounts } from "./connectedAccounts";
import { BackendClient } from "./backendClient";
import { Triggers } from "./triggers";
import { CEG } from "../utils/error";

const LABELS = {
    PRIMARY: "primary"
}


export class Entity {
    id: string;
    backendClient: BackendClient;
    triggerModel: Triggers;
    actionsModel: Actions;
    apps: Apps;
    connectedAccounts: ConnectedAccounts;
    integrations: Integrations;
    activeTriggers: ActiveTriggers;

    constructor(backendClient: BackendClient, id: string = 'default') {
        this.backendClient = backendClient;
        this.id = id;
        this.triggerModel = new Triggers(this.backendClient);
        this.actionsModel = new Actions(this.backendClient);
        this.apps = new Apps(this.backendClient);
        this.connectedAccounts = new ConnectedAccounts(this.backendClient);
        this.integrations = new Integrations(this.backendClient);
        this.activeTriggers = new ActiveTriggers(this.backendClient);
    }

    async execute(actionName: string, params?: Record<string, any> | undefined, text?: string | undefined, connectedAccountId?: string) {
        try{
        const action = await this.actionsModel.get({
            actionName: actionName
        });
        if (!action) {
            throw new Error(`Could not find action: ${actionName}`);
        }
        const app = await this.apps.get({
            appKey: action.appKey!
        });
        if ((app.yaml as any).no_auth) {
            return this.actionsModel.execute({
                actionName: actionName,
                requestBody: {
                    input: params,
                    appName: action.appKey
                }
            });
        }
        let connectedAccount = null;
        if (connectedAccountId) {
            connectedAccount = await this.connectedAccounts.get({
                connectedAccountId: connectedAccountId
            });
        } else {
            const connectedAccounts = await this.connectedAccounts.list({
                
                //@ts-ignore
                user_uuid: this.id,
                appNames: action.appKey,
                status: 'ACTIVE'
            });
            // @ts-ignore
            if (connectedAccounts?.items!.length === 0) {
                throw new Error('No connected account found');
            }

            for (const account of connectedAccounts.items!) {
                if (account?.labels && account?.labels.includes(LABELS.PRIMARY)) {
                    connectedAccount = account;
                    break;
                }
            }

            if (!connectedAccount) {
                connectedAccount = connectedAccounts.items![0];
            }
        }
        return this.actionsModel.execute({
            actionName: actionName,
            requestBody: {
                // @ts-ignore
                connectedAccountId: connectedAccount?.id as unknown as string,
                input: params,
                appName: action.appKey,
                text: text
            }
        });
    }catch(error){
        throw CEG.handleError(error);
    }
    }

    async getConnection(app?: string, connectedAccountId?: string): Promise<any | null> {
        try{
        if (connectedAccountId) {
            return await this.connectedAccounts.get({
                connectedAccountId
            });
        }

        let latestAccount = null;
        let latestCreationDate: Date | null = null;
        const connectedAccounts = await this.connectedAccounts.list({
            // @ts-ignore
            user_uuid: this.id,
        });

        if (!connectedAccounts.items || connectedAccounts.items.length === 0) {
            return null;
        }

        for (const connectedAccount of connectedAccounts.items!) {
            if (app?.toLocaleLowerCase() === connectedAccount.appName.toLocaleLowerCase()) {
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

        return this.connectedAccounts.get({
            connectedAccountId: latestAccount.id!
        });
    }catch(error){
        throw CEG.handleError(error);
    }
    }

    async setupTrigger(app: string, triggerName: string, config: { [key: string]: any; }) {
        try{
        const connectedAccount = await this.getConnection(app);
        if (!connectedAccount) {
            throw new Error(`Could not find a connection with app='${app}' and entity='${this.id}'`);
        }
        const trigger = await this.triggerModel.setup(connectedAccount.id!, triggerName, config);
        return trigger;
    }catch(error){
        throw CEG.handleError(error);
    }
    }

    async disableTrigger(triggerId: string): Promise<any> {
        try{
        await this.activeTriggers.disable({ triggerId: triggerId });
        return {status: "success"};
    }catch(error){
        throw CEG.handleError(error);
    }
    }

    async getConnections(){
        /**
         * Get all connections for an entity.
         */
        try{
        const connectedAccounts = await this.connectedAccounts.list({
            // @ts-ignore
            user_uuid: this.id
        });
        return connectedAccounts.items!;
    }catch(error){
        throw CEG.handleError(error);
    }
    }

    async getActiveTriggers() {
        /**
         * Get all active triggers for an entity.
         */
        try{
        const connectedAccounts = await this.getConnections();
        const activeTriggers = await this.activeTriggers.list({
            // @ts-ignore
           connectedAccountIds: connectedAccounts!.map((account:any) => account.id!).join(",")
        });
        return activeTriggers;
    }catch(error){
        throw CEG.handleError(error);
    }
    }

    async initiateConnection(
        appName: string,
        authMode?: any,
        authConfig?: { [key: string]: any; },
        redirectUrl?: string,
        integrationId?: string,
        connectionData?: Record<string, any>,
        labels: string[] = []
    ): Promise<ConnectionRequest> {
        try{
        // Get the app details from the client
        const app = await this.apps.get({ appKey: appName });

        const isTestConnectorAvailable = app.testConnectors && app.testConnectors.length > 0;

        if (!isTestConnectorAvailable && app.no_auth === false ) {
            if (!authMode) {
                // @ts-ignore
                console.log("Auth schemes not provided, available auth schemes and authConfig")
                // @ts-ignore
                for (const authScheme of app.auth_schemes) {
                    // @ts-ignore
                    console.log("autheScheme:", authScheme.name,"\n", "fields:", authScheme.fields);
                }

                throw new Error(`Please pass authMode and authConfig.`);
            }
        }

        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

        let integration = integrationId ? await this.integrations.get({ integrationId: integrationId }) : null;
        // Create a new integration if not provided
        if (!integration && authMode) {
            integration = await this.integrations.create({
                appId: app.appId!,
                name: `integration_${timestamp}`,
                authScheme: authMode,
                authConfig: authConfig,
                useComposioAuth: false,
            });
        }

 
        if (!integration && !authMode) {
            integration = await this.integrations.create({
                appId: app.appId!,
                name: `integration_${timestamp}`,
                useComposioAuth: true,
            });
        }
        
        // Initiate the connection process
        return this.connectedAccounts.initiate({
            integrationId: integration!.id!,
            userUuid: this.id,
            redirectUri: redirectUrl,
            //@ts-ignore
            data: connectionData,
            labels: labels
        });
    }catch(error){
        throw CEG.handleError(error);
    }
    }
}
