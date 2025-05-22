import ComposioClient from '@composio/client';
import { Tools } from './models/Tools';
import { Toolkits } from './models/Toolkits';
import { Triggers } from './models/Triggers';
import { AuthConfigs } from './models/AuthConfigs';
import { ConnectedAccounts } from './models/ConnectedAccounts';
import { BaseComposioProvider } from './provider/BaseProvider';
import { telemetry } from './telemetry/Telemetry';
import { BaseTelemetryTransport } from './telemetry/TelemetryTransport';
import { getSDKConfig } from './utils/sdk';
import logger from './utils/logger';
import { IS_DEVELOPMENT_OR_CI } from './utils/constants';
import { checkForLatestVersionFromNPM } from './utils/version';
import { OpenAIProvider } from './provider/OpenAIProvider';
import { version } from '../package.json';
import { getRandomUUID } from './utils/uuid';

export type ComposioConfig<
  TProvider extends BaseComposioProvider<unknown, unknown> = OpenAIProvider,
> = {
  apiKey?: string | null;
  baseURL?: string | null;
  allowTracking?: boolean;
  allowTracing?: boolean;
  provider?: TProvider;
  telemetryTransport?: BaseTelemetryTransport;
};

/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<TProvider extends BaseComposioProvider<unknown, unknown> = OpenAIProvider> {
  /**
   * The Composio API client.
   * @type {ComposioClient}
   */
  private client: ComposioClient;

  /**
   * The configuration for the Composio SDK.
   * @type {ComposioConfig<TProvider>}
   */
  private config: ComposioConfig<TProvider>;

  /**
   * Core models for Composio.
   */
  tools: Tools<unknown, unknown, TProvider>;
  toolkits: Toolkits;
  triggers: Triggers;
  provider: TProvider;
  // auth configs
  authConfigs: AuthConfigs;
  // connected accounts
  connectedAccounts: ConnectedAccounts;

  /**
   * @param {Object} config Configuration for the Composio SDK.
   * @param {string} config.apiKey The API key for the Composio SDK.
   * @param {string} config.baseURL The base URL for the Composio SDK.
   * @param {string} config.runtime The runtime for the Composio SDK.
   * @param {boolean} config.allowTracking Whether to allow analytics / tracking. Defaults to true.
   * @param {boolean} config.allowTracing Whether to allow tracing. Defaults to true.
   * @param {TProvider} config.provider The provider to use for this Composio instance.
   */
  constructor({ ...config }: ComposioConfig<TProvider>) {
    const { baseURL: baseURLParsed, apiKey: apiKeyParsed } = getSDKConfig(
      config?.baseURL,
      config?.apiKey
    );

    if (IS_DEVELOPMENT_OR_CI) {
      logger.debug(`Initializing Composio w API Key: [REDACTED] and baseURL: ${baseURLParsed}`);
    }

    /**
     * Initialize the Composio SDK client.
     * The client is used to make API calls to the Composio API.
     */
    this.client = new ComposioClient({
      apiKey: apiKeyParsed,
      baseURL: baseURLParsed,
    });

    /**
     * Keep a reference to the config object.
     * This is useful for creating a builder pattern, debugging and logging.
     */
    this.config = {
      ...config,
      allowTracking: config.allowTracking ?? true,
      allowTracing: config.allowTracing ?? true,
    };

    /**
     * Set the default provider, if not provided by the user.
     */
    this.provider = (config.provider ?? new OpenAIProvider()) as TProvider;
    this.tools = new Tools(this.client, this.provider);

    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client);
    this.authConfigs = new AuthConfigs(this.client);

    // Initialize the connected accounts model.
    this.connectedAccounts = new ConnectedAccounts(this.client);

    /**
     * Initialize the client telemetry.
     */
    if (this.config.allowTracking) {
      telemetry.setup(
        {
          apiKey: apiKeyParsed ?? '',
          baseUrl: baseURLParsed ?? '',
          frameworkRuntime: this.provider?.name || 'unknown',
          isAgentic: this.provider?._isAgentic || false,
          source: 'javascript',
          version: version,
          sdkType: 'Typescript-V3',
          isBrowser: typeof window !== 'undefined',
          // @TODO: Users might want to pass their own session id
          // @TODO: We shouldn't be doing this as people might always have one session id throughout the process in server
          sessionId: this.config.allowTracing ? getRandomUUID() : undefined, // @TODO: get the session id
        },
        config.telemetryTransport
      );
    }
    telemetry.instrument(this);
    // instrument the provider since we are not using the provider class directly
    telemetry.instrument(this.provider);

    // Check for the latest version of the Composio SDK from NPM.
    checkForLatestVersionFromNPM(version);
  }

  /**
   * Get the Composio SDK client.
   * @returns {ComposioClient} The Composio API client.
   */
  getClient(): ComposioClient {
    if (!this.client) {
      throw new Error('Composio client is not initialized. Please initialize it first.');
    }
    return this.client;
  }
}
