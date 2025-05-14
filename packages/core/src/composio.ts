import ComposioClient from '@composio/client';
import { Tools } from './models/Tools';
import { Toolkits } from './models/Toolkits';
import { Triggers } from './models/Triggers';
import { AuthConfigs } from './models/AuthConfigs';
import { ConnectedAccounts } from './models/ConnectedAccounts';
import { BaseComposioToolset } from './toolset/BaseToolset';
import { Telemetry } from './telemetry/Telemetry';
import { BaseTelemetryTransport } from './telemetry/TelemetryTransport';
import type { TelemetryMetadata } from './types/telemetry.types';
import type { ToolsetOptions } from './types/modifiers.types';
import type { ToolListParams } from './types/tool.types';
import { getSDKConfig } from './utils/sdk';
import logger from './utils/logger';
import { IS_DEVELOPMENT_OR_CI } from './utils/constants';
import { checkForLatestVersionFromNPM } from './utils/version';
import { OpenAIToolset } from './toolset/OpenAIToolset';
import { version } from '../package.json';
import { getRandomUUID } from './utils/uuid';

export type ComposioConfig<TToolset extends BaseComposioToolset<unknown, unknown> = OpenAIToolset> =
  {
    apiKey?: string;
    baseURL?: string;
    allowTracking?: boolean;
    allowTracing?: boolean;
    toolset?: TToolset;
    telemetryTransport?: BaseTelemetryTransport;
  };

/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<TToolset extends BaseComposioToolset<unknown, unknown> = OpenAIToolset> {
  private readonly DEFAULT_USER_ID = 'default';
  /**
   * The Composio API client.
   * @type {ComposioClient}
   */
  private client: ComposioClient;

  /**
   * The configuration for the Composio SDK.
   * @type {ComposioConfig<TToolset>}
   */
  private config: ComposioConfig<TToolset>;

  private telemetry: Telemetry | undefined;

  /**
   * Core models for Composio.
   */
  tools: Tools<unknown, unknown, TToolset>;
  toolkits: Toolkits;
  triggers: Triggers;
  toolset: TToolset;
  authConfigs: AuthConfigs;
  // connected accounts
  connectedAccounts: ConnectedAccounts;
  createConnectedAccount: ConnectedAccounts['createConnectedAccount'];

  /**
   * @param {Object} config Configuration for the Composio SDK.
   * @param {string} config.apiKey The API key for the Composio SDK.
   * @param {string} config.baseURL The base URL for the Composio SDK.
   * @param {string} config.runtime The runtime for the Composio SDK.
   * @param {boolean} config.allowTracking Whether to allow analytics / tracking. Defaults to true.
   * @param {boolean} config.allowTracing Whether to allow tracing. Defaults to true.
   * @param {TToolset} config.toolset The toolset to use for this Composio instance.
   */
  constructor(config: ComposioConfig<TToolset>) {
    const { baseURL: baseURLParsed, apiKey: apiKeyParsed } = getSDKConfig(
      config?.baseURL,
      config?.apiKey
    );

    if (IS_DEVELOPMENT_OR_CI) {
      logger.info(`Initializing Composio w API Key: [REDACTED] and baseURL: ${baseURLParsed}`);
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
    };

    /**
     * Set the default toolset, if not provided by the user.
     */
    this.toolset = (config.toolset ?? new OpenAIToolset()) as TToolset;
    this.toolset.setComposio(this);
    /**
     * Initialize all the models with composio client.
     */
    this.tools = new Tools(this.client, this.toolset);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client);
    this.authConfigs = new AuthConfigs(this.client);

    // Initialize the connected accounts model.
    this.connectedAccounts = new ConnectedAccounts(this.client);
    this.createConnectedAccount = this.connectedAccounts.createConnectedAccount;

    /**
     * Initialize the client telemetry.
     */
    if (this.config.allowTracking ?? true) {
      this.initializeTelemetry(
        {
          apiKey: apiKeyParsed ?? '',
          baseUrl: baseURLParsed ?? '',
          frameworkRuntime: 'node',
          source: 'node', // @TODO: get the source
          composioVersion: version,
          isBrowser: typeof window !== 'undefined',
          sessionId: getRandomUUID(), // @TODO: get the session id
        },
        config.telemetryTransport
      );
    }

    // Check for the latest version of the Composio SDK from NPM.
    checkForLatestVersionFromNPM(version);
  }

  /**
   * Initialize the instrumentations and telemetry for the Composio SDK.
   * @param {TelemetryMetadata} config - The configuration for the telemetry.
   * @param {BaseTelemetryTransport} transport - The transport for the telemetry.
   */
  private initializeTelemetry(config: TelemetryMetadata, transport?: BaseTelemetryTransport) {
    this.telemetry = new Telemetry(config, transport);
    /**
     * Instrument the instance and all the models with telemetry.
     */
    this.telemetry.instrumentTelemetry(this);
    this.telemetry.instrumentTelemetry(this.tools);
    this.telemetry.instrumentTelemetry(this.toolkits);
    this.telemetry.instrumentTelemetry(this.triggers);
    this.telemetry.instrumentTelemetry(this.authConfigs);
    this.telemetry.instrumentTelemetry(this.connectedAccounts);
    this.telemetry.instrumentTelemetry(this.toolset);
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

  /**
   * Fetch all the tools from Composio.
   * @param {ToolListParams} params Parameters to fetch the tools.
   * @param {ToolsetOptions<TToolset>} modifiers Modifiers to apply to the tools.
   * @returns {Promise<ReturnType<TToolset['getTools']>>} The tools from the toolset.
   */
  getTools<T extends TToolset>(
    userId: string,
    filters: ToolListParams,
    modifiers?: ToolsetOptions<T>
  ): Promise<ReturnType<T['getTools']>> {
    return this.tools.get(userId, filters, modifiers) as Promise<ReturnType<T['getTools']>>;
  }

  /**
   * Fetch a tool from Composio by its slug.
   * @param {string} slug slug of the tool
   * @param {ToolsetOptions<TToolset>} modifiers to be applied to the tool
   * @returns {Promise<ReturnType<TToolset['getToolBySlug']>>} The tool from the toolset.
   */
  getToolBySlug<T extends TToolset>(
    userId: string,
    slug: string,
    modifiers?: ToolsetOptions<T>
  ): Promise<ReturnType<T['getToolBySlug']>> {
    return this.tools.get(userId, slug, modifiers) as Promise<ReturnType<T['getToolBySlug']>>;
  }
}
