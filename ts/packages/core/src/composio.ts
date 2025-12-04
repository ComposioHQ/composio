import type { BaseComposioProvider } from './provider/BaseProvider';
import ComposioClient from '@composio/client';
import { Tools } from './models/Tools';
import { Toolkits } from './models/Toolkits';
import { Triggers } from './models/Triggers';
import { AuthConfigs } from './models/AuthConfigs';
import { ConnectedAccounts } from './models/ConnectedAccounts';
import { MCP } from './models/MCP.experimental';
import { MCP as DeprecatedMCP } from './models/MCP';
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
import { ToolRouter } from './models/ToolRouter';
import { ToolRouterCreateSessionConfig, ToolRouterSession } from './types/toolRouter.types';

export type ComposioConfig<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown> = OpenAIProvider,
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
   * The versions of the toolkits to use for tool execution and retrieval.
   * Omit to use 'latest' for all toolkits.
   *
   * **Version Control:**
   * When executing tools manually (via `tools.execute()`), if this resolves to "latest",
   * you must either:
   * - Set `dangerouslySkipVersionCheck: true` in the execute params (not recommended for production)
   * - Specify a concrete version here or in environment variables
   * - Pass a specific `version` parameter to the execute call
   *
   * Defaults to 'latest' if nothing is provided.
   * You can specify individual toolkit versions via environment variables: `COMPOSIO_TOOLKIT_VERSION_GITHUB=20250902_00`
   *
   * @example Global version for all toolkits, omit to use 'latest'
   * ```typescript
   * const composio = new Composio();
   * ```
   *
   * @example Specific versions for different toolkits (recommended for production)
   * ```typescript
   * const composio = new Composio({
   *   toolkitVersions: {
   *     github: '20250909_00',
   *     slack: '20250902_00'
   *   }
   * });
   * ```
   *
   * @example Set via environment variables
   * ```typescript
   * // Set environment variables:
   * // COMPOSIO_TOOLKIT_VERSION_GITHUB=20250909_00
   * // COMPOSIO_TOOLKIT_VERSION_SLACK=20250902_00
   * const composio = new Composio(); // Will use env variables
   * ```
   */
  toolkitVersions?: ToolkitVersionParam;
};

/**
 * This is the core class for Composio.
 * It is used to initialize the Composio SDK and provide a global configuration.
 */
export class Composio<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown> = OpenAIProvider,
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
  triggers: Triggers<TProvider>;
  provider: TProvider;
  files: Files;
  authConfigs: AuthConfigs;
  connectedAccounts: ConnectedAccounts;
  mcp: MCP;
  /**
   * Experimental feature, use with caution
   * @experimental
   */
  toolRouter: ToolRouter<unknown, unknown, TProvider>;

  /**
   * Experimental features
   */
  experimental: {
    /**
     * Creates a new tool router session for a user.
     *
     * @param userId {string} The user id to create the session for
     * @param config {ToolRouterConfig} The config for the tool router session
     * @returns {Promise<ToolRouterSession<TToolCollection, TTool, TProvider>>} The tool router session
     *
     * @example
     * ```typescript
     * import { Composio } from '@composio/core';
     *
     * const composio = new Composio();
     * const userId = 'user_123';
     *
     * const session = await composio.create(userId, {
     *  manageConnections: true,
     * });
     *
     * console.log(session.sessionId);
     * console.log(session.url);
     * console.log(session.tools());
     * ```
     */
    create: (
      userId: string,
      routerConfig?: ToolRouterCreateSessionConfig
    ) => Promise<ToolRouterSession<unknown, unknown, TProvider>>;

    /**
     * Use an existing tool router session
     *
     * @param id {string} The id of the session to use
     * @returns {Promise<ToolRouterSession<TToolCollection, TTool, TProvider>>} The tool router session
     */
    use: (id: string) => Promise<ToolRouterSession<unknown, unknown, TProvider>>;
  };

  /**
   * Deprecated features
   */
  deprecated: {
    mcp: DeprecatedMCP<TProvider>;
  };

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
     * Set the default provider, if not provided by the user.
     */
    this.provider = (config?.provider ?? new OpenAIProvider()) as TProvider;

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
      provider: config?.provider ?? this.provider,
    };

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

    this.tools = new Tools(this.client, this.config);
    this.mcp = new MCP(this.client);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client, this.config);
    this.authConfigs = new AuthConfigs(this.client);
    this.files = new Files(this.client);
    this.connectedAccounts = new ConnectedAccounts(this.client);
    this.toolRouter = new ToolRouter(this.client, this.config);

    /**
     * Initialize Experimental features
     */
    this.experimental = {
      create: async (
        userId: string,
        routerConfig?: ToolRouterCreateSessionConfig
      ): Promise<ToolRouterSession<unknown, unknown, TProvider>> => {
        return this.toolRouter.create(userId, routerConfig);
      },
      use: async (id: string): Promise<ToolRouterSession<unknown, unknown, TProvider>> => {
        return this.toolRouter.use(id);
      },
    };

    /**
     * Initialize Deprecated features
     */
    this.deprecated = {
      /**
       * @deprecated this feature will be removed soon, use `composio.mcp`
       */
      mcp: new DeprecatedMCP(this.client, this.provider),
    };

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
    telemetry.instrument(this, 'Composio');
    // instrument the provider since we are not using the provider class directly
    telemetry.instrument(
      this.provider,
      this.provider.name ?? this.provider.constructor.name ?? 'unknown'
    );

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
