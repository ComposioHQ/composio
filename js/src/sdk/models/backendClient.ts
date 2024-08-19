import apiClient from "../client/client"
import { client as axiosClient } from "../client/services.gen"

/**
 * Class representing the details required to initialize and configure the API client.
 */
export class BackendClient {
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

    /**
     * Creates an instance of apiClientDetails.
     * @param {string} apiKey - The API key for client initialization.
     * @param {string} baseUrl - The base URL for the API client.
     * @param {string} runtime - The runtime environment identifier.
     * @throws Will throw an error if the API key is not provided.
     */
    constructor(apiKey: string, baseUrl: string, runtime?: string) {
        this.runtime = runtime || '';
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;

        if (!apiKey) {
            throw new Error(`API Key is required for initializing the client`);
        }

        // Validate baseUrl
        if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
            throw new Error(`Base URL is not valid, got ${baseUrl}`);
        }

        this.initializeApiClient();
    }

    /**
     * Retrieves the client ID from the user's information.
     * @returns {Promise<string>} A promise that resolves to the client ID.
     * @throws Will throw an error if the HTTP request fails.
     */
    public async getClientId(): Promise<string> {
        const response = await apiClient.clientAuthService.getUserInfo();
        if (response.status !== 200) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        return (response.data as unknown as Record<string, Record<string, string>>).client.id;
    }

    /**
     * Initializes the API client with the provided configuration.
     * @private
     */
    private initializeApiClient() {
        axiosClient.setConfig({
            baseURL: this.baseUrl,
            headers: {
                'X-API-KEY': `${this.apiKey}`,
                'X-SOURCE': 'js_sdk',
                'X-RUNTIME': this.runtime
            }
        });
    }
}
