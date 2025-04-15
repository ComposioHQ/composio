import ComposioClient from "@composio/client";
import { Tools } from "./models/Tools";
import { Toolkits } from "./models/Toolkits";
import { Triggers } from "./models/Triggers";
import { Org } from "./models/Org";
import { ComposioToolset } from "./toolset/ComposioToolset";
import { Toolset } from "./types/Toolset.types.";
import { Tool } from "./types/Tool.types";

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
  org: Org;
  toolset: TToolset;

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
    this.client = new ComposioClient({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    this.config = config;

    const defaultToolset = new ComposioToolset();
    this.toolset = config.toolset ?? (defaultToolset as unknown as TToolset);

    // Initialize models
    this.tools = new Tools(this.client, this.toolset);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client);
    this.org = new Org(this.client);
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
  getTools(): Promise<TTool[]> {
    console.log("Tools");
    return Promise.resolve([]);
    // return this.tools.get();
  }

  getEntity(): Promise<void> {
    console.log("Entity");
    return Promise.resolve();
  }
}
