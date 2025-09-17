import type { BaseComposioProvider } from './provider/BaseProvider';
import ComposioClient from '@composio/client';
import { Tools } from './models/Tools';
import { Toolkits } from './models/Toolkits';
import { Triggers } from './models/Triggers';
import { AuthConfigs } from './models/AuthConfigs';
import { ConnectedAccounts } from './models/ConnectedAccounts';
import { ExperimentalMCP, MCP } from './models/MCP';
import { telemetry } from './telemetry/Telemetry';
import { getSDKConfig, getToolkitVersionsFromEnv } from './utils/sdk';
import logger from './utils/logger';
import { COMPOSIO_LOG_LEVEL, IS_DEVELOPMENT_OR_CI } from './utils/constants';
import { checkForLatestVersionFromNPM } from './utils/version';
import { OpenAIProvider } from './provider/OpenAIProvider';
import { version } from '../package.json';
import type { ComposioRequestHeaders } from './types/composio.types';
import { Files } from './models/Files';
import { getDefaultHeaders } from './utils/session';
import { ToolkitVersionParam } from './types/tool.types';
import { MCPConfig } from './models/MCPConfig';

/**
 * The experimental configuration options for the Composio SDK.
 */
type ExperimentalConfig = {
  /**
   * Enable experimental MCP (Model Control Protocol) features.
   * More precisely:
   * - Exposes `composio.mcpConfig.*` methods to manage MCP configurations.
   * - Exposes `composio.mcp.experimental.*` methods to interact with MCP servers.
   * @default undefined (disabled)
   */
  mcp?: boolean;
};

export type ComposioConfig<
  TProvider extends BaseComposioProvider<
    unknown,
    unknown,
    /* TMcpResponse */ unknown,
    /* TMcpExperimentalResponse */ unknown
  > = OpenAIProvider,
> = {
  /**
   * The API key for the Composio API.
   * @example 'sk-1234567890'
   */
  apiKey?: string | null;
  /**
   * The base URL of the Composio API.
   * @example 'https://backend.composio.dev'
   */
  baseURL?: string | null;
  /**
   * Whether to allow tracking for the Composio instance.
   * @example true, false
   * @default true
   */
  allowTracking?: boolean;
  /**
   * Whether to automatically upload and download files during tool execution.
   * @example true, false
   * @default true
   */
  autoUploadDownloadFiles?: boolean;
  /**
   * The tool provider to use for this Composio instance.
   * @example new OpenAIProvider()
   */
  provider?: TProvider;
  /**
   * The host service name of the SDK where the SDK is running.
   * This is used to identify the host for telemetry. Ignore it if you are not using telemetry.
   * @example 'mcp', 'apollo', ' etc
   */
  host?: string;
  /**
   * Request options to be passed to the Composio API client.
   * This is useful for passing in a custom fetch implementation.
   * @example
   * ```typescript
   * const composio = new Composio({
   *   defaultHeaders: {
   *      'x-request-id': '1234567890',
   *   },
   * });
   * ```
   */
  defaultHeaders?: ComposioRequestHeaders;
  /**
   * Whether to disable version check for the Composio SDK.
   * @example true, false
   * @default false
   */
  disableVersionCheck?: boolean;
  /**
   * The versions of the toolkits to fetch.
   * Defaults to latest is nothing is provided.
   * Alternatively you can specify individual toolkit versions in the env `COMPOSIO_TOOLKIT_VERSION_GITHUB=20250902_00`
   * @example
   * { 'github': 'latest', 'slack': '20250902_00' }
   * 'latest'
   */
  toolkitVersions?: ToolkitVersionParam;
  /**
   * Experimental configuration options for the Composio SDK.
   * These options may enable features that are not yet stable and may change in future releases.
   *
   * @example
   * ```typescript
   * const composio = new Composio({
   *   experimental: {
   *     mcp: true,
   *   },
   * });
   * ```
   */
  experimental?: ExperimentalConfig;
};

/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown, unknown> = OpenAIProvider,
> {
  /**
   * The Composio API client.
   * @type {ComposioClient}
   */
  protected client: ComposioClient;

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
  files: Files;
  // auth configs
  authConfigs: AuthConfigs;
  // connected accounts
  connectedAccounts: ConnectedAccounts;

  mcp: MCP<TProvider>;

  /**
   * Creates a new instance of the Composio SDK.
   *
   * The constructor initializes the SDK with the provided configuration options,
   * sets up the API client, and initializes all core models (tools, toolkits, etc.).
   *
   * @param {ComposioConfig<TProvider>} config - Configuration options for the Composio SDK
   * @param {string} [config.apiKey] - The API key for authenticating with the Composio API
   * @param {string} [config.baseURL] - The base URL for the Composio API (defaults to production URL)
   * @param {boolean} [config.allowTracking=true] - Whether to allow anonymous usage analytics
   * @param {TProvider} [config.provider] - The provider to use for this Composio instance (defaults to OpenAIProvider)
   *
   * @example
   * ```typescript
   * // Initialize with default configuration
   * const composio = new Composio();
   *
   * // Initialize with custom API key and base URL
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   baseURL: 'https://api.composio.dev'
   * });
   *
   * // Initialize with custom provider
   * const composio = new Composio({
   *   apiKey: 'your-api-key',
   *   provider: new CustomProvider()
   * });
   * ```
   */
  constructor(config?: ComposioConfig<TProvider>) {
    const { baseURL: baseURLParsed, apiKey: apiKeyParsed } = getSDKConfig(
      config?.baseURL,
      config?.apiKey
    );

    if (IS_DEVELOPMENT_OR_CI) {
      logger.debug(`Initializing Composio w API Key: [REDACTED] and baseURL: ${baseURLParsed}`);
    }

    /**
     * Keep a reference to the config object.
     * This is useful for creating a builder pattern, debugging and logging.
     */
    this.config = {
      ...config,
      baseURL: baseURLParsed,
      apiKey: apiKeyParsed,
      toolkitVersions: getToolkitVersionsFromEnv(config?.toolkitVersions),
      allowTracking: config?.allowTracking ?? true,
      autoUploadDownloadFiles: config?.autoUploadDownloadFiles ?? true,
    };

    /**
     * Set the default provider, if not provided by the user.
     */
    this.provider = (config?.provider ?? new OpenAIProvider()) as TProvider;

    const defaultHeaders = getDefaultHeaders(this.config.defaultHeaders, this.provider);

    /**
     * Initialize the Composio SDK client.
     * The client is used to make API calls to the Composio API.
     */
    this.client = new ComposioClient({
      apiKey: apiKeyParsed,
      baseURL: baseURLParsed,
      defaultHeaders: defaultHeaders,
      logLevel: COMPOSIO_LOG_LEVEL,
    });

    this.tools = new Tools(this.client, this.provider, this.config);
    this.mcp = new MCP(this.client, this.provider);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client);
    this.authConfigs = new AuthConfigs(this.client);
    this.files = new Files(this.client);

    // Initialize the connected accounts model.
    this.connectedAccounts = new ConnectedAccounts(this.client);

    /**
     * Initialize the client telemetry.
     */
    if (this.config.allowTracking) {
      telemetry.setup({
        apiKey: apiKeyParsed ?? '',
        baseUrl: baseURLParsed ?? '',
        isAgentic: this.provider?._isAgentic || false,
        version: version,
        isBrowser: typeof window !== 'undefined',
        provider: this.provider?.name ?? 'openai',
        host: this.config.host,
      });
    }
    // instrument the composio instance
    telemetry.instrument(this);
    // instrument the provider since we are not using the provider class directly
    telemetry.instrument(this.provider);

    // Check for the latest version of the Composio SDK from NPM.
    if (!this.config.disableVersionCheck) {
      checkForLatestVersionFromNPM(version);
    }
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
   * Get the configuration SDK is initialized with
   * @returns {ComposioConfig<TProvider>} The configuration SDK is initialized with
   */
  getConfig(): ComposioConfig<TProvider> {
    return this.config;
  }

  /**
   * Creates a new instance of the Composio SDK with custom request options while preserving the existing configuration.
   * This method is particularly useful when you need to:
   * - Add custom headers for specific requests
   * - Track request contexts with unique identifiers
   * - Override default request behavior for a subset of operations
   *
   * The new instance inherits all configuration from the parent instance (apiKey, baseURL, provider, etc.)
   * but allows you to specify custom request options that will be used for all API calls made through this session.
   *
   * @param {MergedRequestInit} fetchOptions - Custom request options to be used for all API calls in this session.
   *                                          This follows the Fetch API RequestInit interface with additional options.
   * @returns {Composio<TProvider>} A new Composio instance with the custom request options applied.
   *
   * @example
   * ```typescript
   * // Create a base Composio instance
   * const composio = new Composio({
   *   apiKey: 'your-api-key'
   * });
   *
   * // Create a session with request tracking headers
   * const composioWithCustomHeaders = composio.createSession({
   *   headers: {
   *     'x-request-id': '1234567890',
   *     'x-correlation-id': 'session-abc-123',
   *     'x-custom-header': 'custom-value'
   *   }
   * });
   *
   * // Use the session for making API calls with the custom headers
   * await composioWithCustomHeaders.tools.list();
   * ```
   */
  createSession(options?: { headers?: ComposioRequestHeaders }): Composio<TProvider> {
    const sessionHeaders = getDefaultHeaders(options?.headers, this.provider);
    return new Composio({
      ...this.config,
      defaultHeaders: sessionHeaders,
    });
  }
}

class ComposioWithExperimentalMCP<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown, unknown> = OpenAIProvider,
> extends Composio<TProvider> {
  mcp: ExperimentalMCP<TProvider>;
  mcpConfig: MCPConfig<TProvider>;

  constructor(config?: ComposioConfig<TProvider>) {
    super(config);
    this.mcp = new ExperimentalMCP(this.client, this.provider);
    this.mcpConfig = new MCPConfig(this.mcp);
  }
}

/**
 * Creates a new instance of the Composio SDK.
 * This factory function enables type-safe access to experimental Composio features.
 */
export function create<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown, unknown> = OpenAIProvider,
>(
  config: { experimental: { mcp: true } } & ComposioConfig<TProvider>
): ComposioWithExperimentalMCP<TProvider>;
export function create<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown, unknown> = OpenAIProvider,
>(config?: ComposioConfig<TProvider>): Composio<TProvider>;
export function create<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown, unknown> = OpenAIProvider,
>(config?: ComposioConfig<TProvider>) {
  if (config?.experimental?.mcp === true) {
    return new ComposioWithExperimentalMCP(config);
  }

  return new Composio(config);
}
