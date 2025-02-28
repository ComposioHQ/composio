import { Client, createClient, createConfig } from "@hey-api/client-axios";
import apiClient from "../client/client";
import { CEG } from "../utils/error";
import { COMPOSIO_SDK_ERROR_CODES } from "../utils/errors/src/constants";
import { removeTrailingSlashIfExists } from "../utils/string";

/**
 * Class representing the details required to initialize and configure the API client.
 */
export class AxiosBackendClient {
  /**
   * The API key used for authenticating requests.
   */
  public apiKey: string;

  /**
   * The base URL of the API against which requests will be made.
   */
  public baseUrl: string;

  /**
   * The runtime environment where the client is being used.
   */
  public runtime: string;
  public instance: Client;

  /**
   * Creates an instance of apiClientDetails.
   * @param {string} apiKey - The API key for client initialization.
   * @param {string} baseUrl - The base URL for the API client.
   * @param {string} runtime - The runtime environment identifier.
   * @throws Will throw an error if the API key is not provided.
   */
  constructor(apiKey: string, baseUrl: string, runtime?: string) {
    this.runtime = runtime || "";
    this.apiKey = apiKey;
    this.baseUrl = removeTrailingSlashIfExists(baseUrl);
    this.instance = createClient(
      createConfig({
        baseURL: this.baseUrl,
        headers: {
          // common: {
          "X-API-KEY": `${this.apiKey}`,
          "X-SOURCE": "js_sdk",
          "X-RUNTIME": this.runtime,
          // }
        },
      })
    );
    if (!apiKey) {
      throw CEG.getCustomError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.API_KEY_UNAVAILABLE,
        {
          message: "API key is not available",
          description:
            "The API key required for authentication is not provided. You can get the API key from the Composio dashboard.",
          possibleFix: "Please provide the API key in the constructor",
        }
      );
    }

    // Validate baseUrl
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      throw CEG.getCustomError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.BASE_URL_NOT_REACHABLE,
        {
          message: `🔗 Base URL ${baseUrl} is not valid`,
          description: "The composio backend URL provided is not valid",
        }
      );
    }

    this.initializeApiClient();
  }

  /**
   * Retrieves the client ID from the user's information.
   * @returns {Promise<string>} A promise that resolves to the client ID.
   * @throws Will throw an error if the HTTP request fails.
   */
  public async getClientId(): Promise<string> {
    try {
      const { data } = await apiClient.clientAuth.getUserInfo({
        client: this.instance,
      });
      return data?.client?.id || "";
    } catch (error) {
      throw CEG.handleAllError(error);
    }
  }
  /**
   * Initializes the API client with the provided configuration.
   * @private
   */
  private initializeApiClient() {
    this.instance.setConfig({
      baseURL: removeTrailingSlashIfExists(this.baseUrl),
      headers: {
        common: {
          "X-API-KEY": `${this.apiKey}`,
          "X-SOURCE": "js_sdk",
          "X-RUNTIME": this.runtime,
        },
      },
      throwOnError: true,
    });

    // setAxiosClientConfig(this.instance.instance);
  }

  getAxiosInstance() {
    return this.instance.instance;
  }
}
