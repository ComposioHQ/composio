import ComposioSDK from "@composio/client";
import { RequestOptions } from "@composio/client/internal/request-options";
import {
    ConnectedAccountListParams,
    ConnectedAccountListResponse,
    ConnectedAccountCreateParams,
    ConnectedAccountCreateResponse,
    ConnectedAccountDeleteResponse,
    ConnectedAccountRetrieveResponse,
    ConnectedAccountRefreshResponse,
    ConnectedAccountUpdateStatusParams,
    ConnectedAccountUpdateStatusResponse,
} from "@composio/client/resources/connected-accounts";

/**
 * ConnectedAccounts class
 * 
 * This class is used to manage connected accounts in the Composio SDK.
 * Connected accounts are used to authenticate with third-party services.
 */
export class ConnectedAccounts {
    private client: ComposioSDK;

    constructor(client: ComposioSDK) {
        this.client = client;
    }

    /**
     * List all connected accounts
     * @param {ConnectedAccountListParams} query - Query parameters for filtering connected accounts
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountListResponse>} List of connected accounts
     */
    async list(
        query?: ConnectedAccountListParams,
        options?: RequestOptions
    ): Promise<ConnectedAccountListResponse> {
        return this.client.connectedAccounts.list(query, options);
    }

    /**
     * Create a new connected account
     * @param {ConnectedAccountCreateParams} data - Data for creating a new connected account
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountCreateResponse>} Created connected account
     */
    async create(
        data: ConnectedAccountCreateParams,
        options?: RequestOptions
    ): Promise<ConnectedAccountCreateResponse> {
        return this.client.connectedAccounts.create(data, options);
    }

    /**
     * Get a connected account by nanoid
     * @param {string} nanoid - Unique identifier of the connected account
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountRetrieveResponse>} Connected account details
     */
    async get(
        nanoid: string,
        options?: RequestOptions
    ): Promise<ConnectedAccountRetrieveResponse> {
        return this.client.connectedAccounts.retrieve(nanoid, options);
    }

    /**
     * Delete a connected account
     * @param {string} nanoid - Unique identifier of the connected account to delete
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountDeleteResponse>} Response from deletion
     */
    async delete(
        nanoid: string,
        options?: RequestOptions
    ): Promise<ConnectedAccountDeleteResponse> {
        return this.client.connectedAccounts.delete(nanoid, options);
    }

    /**
     * Refresh a connected account's credentials
     * @param {string} nanoid - Unique identifier of the connected account to refresh
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountRefreshResponse>} Refreshed connected account details
     */
    async refresh(
        nanoid: string,
        options?: RequestOptions
    ): Promise<ConnectedAccountRefreshResponse> {
        return this.client.connectedAccounts.refresh(nanoid, options);
    }

    /**
     * Update the status of a connected account
     * @param {string} nanoid - Unique identifier of the connected account
     * @param {ConnectedAccountUpdateStatusParams} params - Parameters for updating the status
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
     */
    async updateStatus(
        nanoid: string,
        params: ConnectedAccountUpdateStatusParams,
        options?: RequestOptions
    ): Promise<ConnectedAccountUpdateStatusResponse> {
        return this.client.connectedAccounts.updateStatus(nanoid, params, options);
    }

    /**
     * Enable a connected account
     * @param {string} nanoid - Unique identifier of the connected account
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
     */
    async enable(
        nanoid: string,
        options?: RequestOptions
    ): Promise<ConnectedAccountUpdateStatusResponse> {
        return this.client.connectedAccounts.updateStatus(nanoid, { enabled: true }, options);
    }

    /**
     * Disable a connected account
     * @param {string} nanoid - Unique identifier of the connected account
     * @param {RequestOptions} options - Request options
     * @returns {Promise<ConnectedAccountUpdateStatusResponse>} Updated connected account details
     */
    async disable(
        nanoid: string,
        options?: RequestOptions
    ): Promise<ConnectedAccountUpdateStatusResponse> {
        return this.client.connectedAccounts.updateStatus(nanoid, { enabled: false }, options);
    }
}