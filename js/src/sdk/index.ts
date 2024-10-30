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
import axios from 'axios';
import { getPackageJsonDir } from './utils/projectUtils';
import { isNewerVersion } from './utils/other';
import { getClientBaseConfig } from './utils/config';
import chalk from 'chalk';
import { AppConnectorControllerGetConnectorInfoResponse } from './client';
export class Composio {
    /**
     * The Composio class serves as the main entry point for interacting with the Composio SDK.
     * It provides access to various models that allow for operations on connected accounts, apps,
     * actions, triggers, integrations, and active triggers.
     */
    backendClient: BackendClient;
    connectedAccounts: ConnectedAccounts;
    apps: Apps;
    actions: Actions;
    triggers: Triggers;
    integrations: Integrations;
    activeTriggers: ActiveTriggers;

    /**
     * Initializes a new instance of the Composio class.
     * 
     * @param {string} [apiKey] - The API key for authenticating with the Composio backend. Can also be set locally in an environment variable.
     * @param {string} [baseUrl] - The base URL for the Composio backend. By default, it is set to the production URL.
     * @param {string} [runtime] - The runtime environment for the SDK.
     */
    constructor(apiKey?: string, baseUrl?: string, runtime?: string) {
        // // Parse the base URL and API key, falling back to environment variables or defaults if not provided.
        const { baseURL: baseURLParsed, apiKey: apiKeyParsed } =  getClientBaseConfig(baseUrl, apiKey);

        if(!apiKeyParsed){
            console.log(chalk.yellow("Oops! We couldn't find your API key. You can set it by:\n"));
            console.log(chalk.white("1. Running 'composio login' after installing `npm install -g composio-core`"));
            console.log(chalk.white("2. Setting the COMPOSIO_API_KEY environment variable"));
            console.log(chalk.white("3. Passing api key as a parameter to the Composio constructor \n "));
            throw new Error("Please provide an API key.");
        }

        // Initialize the BackendClient with the parsed API key and base URL.
        this.backendClient = new BackendClient(apiKeyParsed, baseURLParsed, runtime);

        // Instantiate models with dependencies as needed.
        this.connectedAccounts = new ConnectedAccounts(this.backendClient);
        this.triggers = new Triggers(this.backendClient);
        this.apps = new Apps(this.backendClient);
        this.actions = new Actions(this.backendClient);
        this.integrations = new Integrations(this.backendClient);
        this.activeTriggers = new ActiveTriggers(this.backendClient);

        this.checkForLatestVersionFromNPM();
    }

    /**
     * Checks for the latest version of the Composio SDK from NPM.
     * If a newer version is available, it logs a warning to the console.
     */
    async checkForLatestVersionFromNPM() {
        try {
            const packageName = "composio-core";
            const packageJsonDir = getPackageJsonDir();
            const currentVersionFromPackageJson = require(packageJsonDir + '/package.json').version;
        
            const response = await axios.get(`https://registry.npmjs.org/${packageName}/latest`);
            const latestVersion = response.data.version;

            
            if (isNewerVersion(latestVersion, currentVersionFromPackageJson)) {
                console.warn(`🚀 Upgrade available! Your composio-core version (${currentVersionFromPackageJson}) is behind. Latest version: ${latestVersion}.`);
            }
        } catch (error) {
            // Ignore and do nothing
        }
    }
    

    /**
     * Retrieves an Entity instance associated with a given ID.
     * 
     * @param {string} [id='default'] - The ID of the entity to retrieve.
     * @returns {Entity} An instance of the Entity class.
     */
    getEntity(id: string = 'default'): Entity {
        return new Entity(this.backendClient, id);
    }


    async getExpectedParamsForUser(
        params: { app?: string; integrationId?: string; entityId?: string; authScheme?: "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT" } = {},
    ): Promise<{ expectedInputFields: AppConnectorControllerGetConnectorInfoResponse["expectedInputFields"], integrationId: string, authScheme: "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT" }> {
        const { app, entityId } = params;
        let { integrationId } = params;
        if (integrationId === null && app === null) {
            throw new Error(
                "Both `integration_id` and `app` cannot be None"
            );
        }

        if (!integrationId) {
            try {
                const integrations = await this.integrations.list({
                    appName: app!,
                    showDisabled: false
                })
                if (params.authScheme && integrations) {
                    integrations.items = integrations.items.filter((integration: any) => integration.authScheme === params.authScheme);
                }
                integrationId = (integrations?.items[0] as any)?.id;
            } catch (_) {
                // do nothing
            }
        }

        let integration =  integrationId ? (await this.integrations.get({
            integrationId: integrationId!
        })) : undefined;

        if(integration) {
            return {
                expectedInputFields: integration.expectedInputFields,
                integrationId: integration.id!,
                authScheme: integration.authScheme as "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT"
            }
        }

        const appInfo = await this.apps.get({
            appKey: app!.toLocaleLowerCase()
        });

        const preferredAuthScheme = ["OAUTH2", "OAUTH1", "API_KEY", "BASIC", "BEARER_TOKEN", "BASIC_WITH_JWT"];

        let schema: typeof preferredAuthScheme[number] | undefined = params.authScheme;
        
        if(!schema) {
            for(const scheme of preferredAuthScheme) {
                if(appInfo.auth_schemes?.map((_authScheme: any) => _authScheme.mode).includes(scheme)) {
                    schema = scheme;
                    break;
                }
            }
        }

        const areNoFieldsRequiredForIntegration = (appInfo.testConnectors?.length ?? 0) > 0 || ((appInfo.auth_schemes?.find((_authScheme: any) => _authScheme.mode === schema) as any)?.fields?.filter((field: any) => !field.expected_from_customer)?.length ?? 0) == 0;

        if (!areNoFieldsRequiredForIntegration) {
            throw new Error(
                `No default credentials available for this app, please create new integration by going to app.composio.dev or through CLI - composio add ${appInfo.key}`
            );
        }

        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");

        if(appInfo.testConnectors?.length! > 0) {
            integration = await this.integrations.create({
                appId: appInfo.appId,
                name: `integration_${timestamp}`,
                authScheme: schema,
                authConfig: {},
                useComposioAuth: true,
            });

            return { 
                expectedInputFields: integration?.expectedInputFields!,
                integrationId: integration?.id!,
                authScheme: integration?.authScheme as "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT"
            }
        }

        if(!schema) {
            throw new Error(
                `No supported auth scheme found for \`${String(app)}\`, ` +
                "Please create an integration and use the ID to " +
                "get the expected parameters."
            );
        }

        integration = await this.integrations.create({
            appId: appInfo.appId,
            name: `integration_${timestamp}`,
            authScheme: schema,
            authConfig: {},
            useComposioAuth: false,
        });

        if(!integration) {
            throw new Error("An unexpected error occurred while creating the integration, please create an integration manually and use its ID to get the expected parameters");
        }
        return { 
            expectedInputFields: integration.expectedInputFields,
            integrationId: integration.id!,
            authScheme: integration.authScheme as "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN" | "BASIC_WITH_JWT"
        }
    }
}

