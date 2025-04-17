import ComposioClient from "@composio/client";
import { Tools } from "./models/Tools";
import { Toolkits } from "./models/Toolkits";
import { Triggers } from "./models/Triggers";
import { ComposioToolset } from "./toolset/ComposioToolset";
import { WrappedTool } from "./types/toolset.types.";
import { Tool } from "./types/tool.types";
import { AuthConfigs } from "./models/AuthConfigs";
import { ConnectedAccounts } from "./models/ConnectedAccounts";
import { ToolListParams } from "@composio/client/resources/tools";
import { BaseComposioToolset } from "./toolset/BaseToolset";


export type ComposioConfig<TToolCollection, TTool, TToolset extends BaseComposioToolset<TToolCollection, TTool>> = {
  apiKey?: string;
  baseURL?: string;
  allowTracking?: boolean;
  allowTracing?: boolean;
  toolset?: TToolset;
  userId?: string;
  connectedAccountIds?: Record<string, string>;
};

/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<TToolCollection, TTool, TToolset extends BaseComposioToolset<TToolCollection, TTool>> {

  private readonly DEFAULT_USER_ID = "default";
  private static readonly FILE_NAME = "core/composio.ts";

  /**
   * The Composio API client.
   * @type {ComposioClient}
   */
  private client: ComposioClient;

  /**
   * The configuration for the Composio SDK.
   * @type {ComposioConfig<TTool, TToolset>}
   */
  private config: ComposioConfig<TToolCollection, TTool, TToolset>;

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
  constructor(config: ComposioConfig<TToolCollection,TTool,TToolset>) {
    /**
     * Initialize the Composio SDK client.
     * The client is used to make API calls to the Composio API.
     */
    this.client = new ComposioClient({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    /**
     * Keep a reference to the config object.
     * This is useful for creating a builder pattern, debugging and logging.
     */
    this.config = config;

    /**
     * Set the context variables for the Composio SDK.
     */
    this.userId = config.userId?? this.DEFAULT_USER_ID; // entity id of the user
    this.connectedAccountIds = config.connectedAccountIds?? {}; // app name -> account id of the connected account

    /**
     * Set the default toolset, if not provided by the user.
     */
    this.toolset = config.toolset ?? new ComposioToolset() as unknown as TToolset;
    this.toolset.setClient(this);

    /**
     * Initialize all the models with composio client.
     */
    this.tools = new Tools(this.client);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client);
    this.authConfigs = new AuthConfigs(this.client);
    this.connectedAccounts = new ConnectedAccounts(this.client);
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
