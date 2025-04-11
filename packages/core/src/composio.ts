import ComposioClient from "@composio/client";
import { Tool, Tools } from "./models/Tools";
import { Toolkits } from "./models/Toolkits";
import { Triggers } from "./models/Triggers";
import { Org } from "./models/Org";
import { ComposioToolset } from "./toolset/Toolset";

// helper type to extract the tool type from a toolset
export type ExtractToolType<TS> = TS extends ComposioToolset<infer T> ? T : Tool;

export type ComposioConfig<TS extends ComposioToolset<Tool>> = {
  apiKey?: string;
  baseURL?: string;
  runtime?: string;
  allowTracking?: boolean;
  allowTracing?: boolean;
  toolset?: TS;
};
/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<TS extends ComposioToolset<any>> {
  /**
   * The Composio API client.
   * @type {ComposioClient}
   */
  private client: ComposioClient;

  private config:  ComposioConfig<TS>

  /**
   * Core models for Composio.
   */
  tools:  Tools<ExtractToolType<TS>, TS>;
  toolkits: Toolkits;
  triggers: Triggers;
  org: Org;
  toolset: TS;

  /**
   *
   * @param {Object} config Configuration for the Composio SDK.
   * @param {string} config.apiKey The API key for the Composio SDK.
   * @param {string} config.baseURL The base URL for the Composio SDK.
   * @param {string} config.runtime The runtime for the Composio SDK.
   * @param {boolean} config.allowTracking Whether to allow analytics / tracking. Defaults to true.
   * @param {boolean} config.allowTracing Whether to allow tracing. Defaults to true.
   */
  constructor(config: ComposioConfig<TS>) {
    this.client = new ComposioClient({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    this.config = config;

    const defaultToolset = new ComposioToolset() as TS;
    this.toolset = config.toolset ?? defaultToolset;

    // initialize models
    this.tools = new Tools<ExtractToolType<TS>, TS>(this.client, this.toolset);
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
}
