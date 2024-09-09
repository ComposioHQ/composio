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
        // Parse the base URL and API key, falling back to environment variables or defaults if not provided.
        const baseURLParsed = baseUrl || getEnvVariable("COMPOSIO_BASE_URL", COMPOSIO_BASE_URL) || "https://backend.composio.dev";
        const apiKeyParsed = apiKey || getEnvVariable("COMPOSIO_API_KEY") || '';

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
}

