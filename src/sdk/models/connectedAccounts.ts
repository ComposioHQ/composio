import { CancelablePromise, listAllConnections, createConnection, GetConnectedAccountResponse, GetConnectedAccountData, CreateConnectionData, CreateConnectionResponse, ListAllConnectionsData, ListAllConnectionsResponse, getConnectedAccount } from "../client";
import { Composio } from "../";

export class ConnectedAccounts {
    constructor(private readonly client: Composio) {
    }

    /**
     * Retrieves a list of all connected accounts in the Composio platform.
     * 
     * It supports pagination and filtering based on various parameters such as app ID, integration ID, and connected account ID. The response includes an array of connection objects, each containing details like the connector ID, connection parameters, status, creation/update timestamps, and associated app information.
     * 
     * @param {ListAllConnectionsData} data The data for the request.
     * @returns {CancelablePromise<ListAllConnectionsResponse>} A promise that resolves to the list of all connected accounts.
     * @throws {ApiError} If the request fails.
     */
    list(data: ListAllConnectionsData = {}): CancelablePromise<ListAllConnectionsResponse> {
        return listAllConnections(data, this.client.config);
    }

    /**
     * Connects an account to the Composio platform.
     * 
     * This method allows you to connect an external app account with Composio. It requires the integration ID in the request body and returns the connection status, connection ID, and a redirect URL (if applicable) for completing the connection flow.
     * 
     * @param {CreateConnectionData} data The data for the request.
     * @returns {CancelablePromise<CreateConnectionResponse>} A promise that resolves to the connection status and details.
     * @throws {ApiError} If the request fails.
     */
    create(data: CreateConnectionData = {}): CancelablePromise<CreateConnectionResponse> {
        return createConnection(data, this.client.config);
    }

    /**
     * Retrieves details of a specific account connected to the Composio platform by providing its connected account ID.
     * 
     * The response includes the integration ID, connection parameters (such as scope, base URL, client ID, token type, access token, etc.), connection ID, status, and creation/update timestamps.
     * 
     * @param {GetConnectedAccountData} data The data for the request.
     * @returns {CancelablePromise<GetConnectedAccountResponse>} A promise that resolves to the details of the connected account.
     * @throws {ApiError} If the request fails.
     */
    get(data: GetConnectedAccountData): CancelablePromise<GetConnectedAccountResponse> {
        return getConnectedAccount(data, this.client.config);
    }
}
