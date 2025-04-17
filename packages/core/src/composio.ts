import ComposioClient from "@composio/client";
import { Tools } from "./models/Tools";
import { Toolkits } from "./models/Toolkits";
import { Triggers } from "./models/Triggers";
import { ComposioToolset } from "./toolset/ComposioToolset";
import { AuthConfigs } from "./models/AuthConfigs";
import { ConnectedAccounts } from "./models/ConnectedAccounts";
import { ToolListParams } from "@composio/client/resources/tools";
import { BaseComposioToolset } from "./toolset/BaseToolset";
import { Telemetry } from "./telemetry/Telemetry";
import { BaseTelemetryTransport, ConsoleTelemetryTransport } from "./telemetry/TelemetryTransport";
import type { InstrumentedInstance } from "./types/telemetry.types";
import { getSDKConfig } from "./utils/sdk";
import logger from "./utils/logger";
import { IS_DEVELOPMENT_OR_CI } from "./utils/constants";
import { checkForLatestVersionFromNPM } from "./utils/version";


export type ComposioConfig<TToolset extends BaseComposioToolset<any, any>> = {
  apiKey?: string;
  baseURL?: string;
  allowTracking?: boolean;
  allowTracing?: boolean;
  toolset?: TToolset;
  userId?: string;
  connectedAccountIds?: Record<string, string>;
  telemetryTransport?: BaseTelemetryTransport;
};

/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<TToolset extends BaseComposioToolset<any, any>> {

  private readonly DEFAULT_USER_ID = "default";
  readonly FILE_NAME = "core/composio.ts";

  /**
   * The Composio API client.
   * @type {ComposioClient}
   */
  private client: ComposioClient;

  /**
   * The configuration for the Composio SDK.
   * @type {ComposioConfig<TTool, TToolset>}
   */
  private config: ComposioConfig<TToolset>;

  private telemetry: Telemetry<InstrumentedInstance> | undefined;

  /**
   * Context variables for the Composio SDK.
   */
  userId?: string;
  connectedAccountIds?: Record<string, string>;


  /**
   * Core models for Composio.
   */
  tools: Tools;
  toolkits: Toolkits;
  triggers: Triggers;
  toolset: TToolset;
  authConfigs: AuthConfigs;
  connectedAccounts: ConnectedAccounts;

  /**
   * @param {Object} config Configuration for the Composio SDK.
   * @param {string} config.apiKey The API key for the Composio SDK.
   * @param {string} config.baseURL The base URL for the Composio SDK.
   * @param {string} config.runtime The runtime for the Composio SDK.
   * @param {boolean} config.allowTracking Whether to allow analytics / tracking. Defaults to true.
   * @param {boolean} config.allowTracing Whether to allow tracing. Defaults to true.
   * @param {TS} config.toolset The toolset to use for this Composio instance.
   */
  constructor(config: ComposioConfig<TToolset>) {

    const { baseURL: baseURLParsed, apiKey: apiKeyParsed } = getSDKConfig(
      config?.baseURL,
      config?.apiKey
    );

    if (IS_DEVELOPMENT_OR_CI) {
      logger.info(
        `Initializing Composio w API Key: [REDACTED] and baseURL: ${baseURLParsed}`
      );
    }
    /**
     * Initialize the Composio SDK client.
     * The client is used to make API calls to the Composio API.
     */
    this.client = new ComposioClient({
      apiKey: apiKeyParsed,
      baseURL: baseURLParsed,
    });

    this.client
    /**
     * Keep a reference to the config object.
     * This is useful for creating a builder pattern, debugging and logging.
     */
    this.config = {
      ...config,
      allowTracking: config.allowTracking ?? true
    };

    /**
     * Set the context variables for the Composio SDK.
     */
    this.userId = config.userId ?? this.DEFAULT_USER_ID; // entity id of the user
    this.connectedAccountIds = config.connectedAccountIds ?? {}; // app name -> account id of the connected account

    /**
     * Set the default toolset, if not provided by the user.
     */
    this.toolset = (config.toolset ?? new ComposioToolset()) as TToolset;
    this.toolset.setClient(this);

    /**
     * Initialize all the models with composio client.
     */
    this.tools = new Tools(this.client);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client);
    this.authConfigs = new AuthConfigs(this.client);
    this.connectedAccounts = new ConnectedAccounts(this.client);

    /**
    * Initialize the client telemetry.
    */
    if (this.config.allowTracking) {

      this.telemetry = new Telemetry({
        apiKey: apiKeyParsed ?? "",
        baseUrl: baseURLParsed ?? "",
        frameworkRuntime: "node",
        source: "node", // @TODO: get the source
        sessionId: this.userId,
        composioVersion: require('../package.json').version,
        isBrowser: typeof window !== "undefined",
      }, config.telemetryTransport ?? new ConsoleTelemetryTransport());


      /**
       * Instrument the client telemetry.
      */
      this.telemetry.instrumentTelemetry(this);
      this.telemetry.instrumentTelemetry(this.tools);
      this.telemetry.instrumentTelemetry(this.toolkits);
      this.telemetry.instrumentTelemetry(this.triggers);
      this.telemetry.instrumentTelemetry(this.authConfigs);
      this.telemetry.instrumentTelemetry(this.connectedAccounts);
      this.telemetry.instrumentTelemetry(this.toolset);

      // Check for the latest version of the Composio SDK from NPM.
      checkForLatestVersionFromNPM();
    }
  }

  /**
   * Get the connected account id for the given app name.
   * @param appName - The name of the app.
   * @returns {string | undefined} The connected account id for the given app name.
   */
  getConnectedAccountId(appName: string): string | undefined {
    return this.connectedAccountIds?.[appName];
  }

  /**
   * Get the Composio SDK client.
   * @returns {ComposioClient} The Composio API client.
   */
  getClient(): ComposioClient {
    if (!this.client) {
      throw new Error(
        "Composio client is not initialized. Please initialize it first."
      );
    }
    return this.client;
  }

  /**
   * Generic function to get all the tools
   * @returns {Promise<ReturnType<TToolset["getTool"]>>} Promise with list of tools
   */
  async getTool(slug: string): Promise<ReturnType<TToolset["getTool"]>> {
    return this.toolset.getTool(slug) as Promise<ReturnType<TToolset["getTool"]>>;
  }

  /**
   * Generic function to get all the tools
   * @param query - Query parameters for the tools
   * @returns {Promise<ReturnType<TToolset["getTools">} Promise with list/records of tools
   */
  async getTools(query?: ToolListParams): Promise<ReturnType<TToolset["getTools"]>> {
    return this.toolset.getTools(query) as Promise<ReturnType<TToolset["getTools"]>>;
  }

}
