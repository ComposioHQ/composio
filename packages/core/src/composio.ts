import ComposioClient from "@composio/client";
import { Tools } from "./models/Tools";
import { Toolkits } from "./models/Toolkits";
import { Triggers } from "./models/Triggers";
import { ComposioToolset } from "./toolset/ComposioToolset";
import { Toolset, WrappedTool } from "./types/toolset.types.";
import { Tool } from "./types/tool.types";
import { AuthConfigs } from "./models/AuthConfigs";
import { ConnectedAccounts } from "./models/ConnectedAccounts";
import { ActionExecutions } from "./models/ActionExecution";

export type ComposioConfig<
  TTool extends Tool,
  TToolset extends Toolset<TTool>
> = {
  apiKey?: string;
  baseURL?: string;
  runtime?: string;
  allowTracking?: boolean;
  allowTracing?: boolean;
  toolset?: TToolset;
};

/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<TTool extends Tool, TToolset extends Toolset<TTool>> {
  /**
   * The Composio API client.
   * @type {ComposioClient}
   */
  private client: ComposioClient;

  private config: ComposioConfig<TTool, TToolset>;

  /**
   * Core models for Composio.
   */
  tools: Tools<TTool, TToolset>;
  toolkits: Toolkits;
  triggers: Triggers;
  toolset: TToolset;
  authConfigs: AuthConfigs;
  connectedAccounts: ConnectedAccounts;
  ActionExecution: ActionExecutions;

  /**
   * @param {Object} config Configuration for the Composio SDK.
   * @param {string} config.apiKey The API key for the Composio SDK.
   * @param {string} config.baseURL The base URL for the Composio SDK.
   * @param {string} config.runtime The runtime for the Composio SDK.
   * @param {boolean} config.allowTracking Whether to allow analytics / tracking. Defaults to true.
   * @param {boolean} config.allowTracing Whether to allow tracing. Defaults to true.
   * @param {TS} config.toolset The toolset to use for this Composio instance.
   */
  constructor(config: {
    apiKey?: string;
    baseURL?: string;
    runtime?: string;
    allowTracking?: boolean;
    allowTracing?: boolean;
    toolset?: TToolset;
  }) {
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
     * Set the default toolset, if not provided by the user.
     */
    const defaultToolset = new ComposioToolset();
    this.toolset = config.toolset ?? (defaultToolset as unknown as TToolset);

    /**
     * Initialize all the models with composio client.
     */
    this.tools = new Tools(this.client, this.toolset);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client);
    this.authConfigs = new AuthConfigs(this.client);
    this.connectedAccounts = new ConnectedAccounts(this.client);
    this.ActionExecution = new ActionExecutions(this.client);
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
   * @returns {Promise<T[]>} Promise with list of tools
   */
  getTool(id: string): Promise<WrappedTool<TToolset>> {
    return this.tools.get(id);
  }

  getTools(): Promise<WrappedTool<TToolset>[]> {
    return this.tools.list();
  }

  getEntity(): Promise<void> {
    console.log("Entity");
    return Promise.resolve();
  }
}
