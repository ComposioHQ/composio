
import client from "../client/client";
import apiClient from "../client/client"

export class ConnectedAccounts {
    constructor() {
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
    list(data: any): any{
        return apiClient.connections.getConnections({
            query: data
        })

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
    create(data: any = {}): any {
        return apiClient.connections.initiateConnection({
            body: data
        });
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
    get(data: any): any {
        return apiClient.connections.getConnection({
            path: data
        });
    }

    /**
     * Initiates a new connected account on the Composio platform.
     * 
     * This method allows you to start the process of connecting an external app account with Composio. It requires the integration ID and optionally the entity ID, additional parameters, and a redirect URL.
     * 
     * @param {CreateConnectionData["requestBody"]} data The data for the request.
     * @returns {CancelablePromise<ConnectionRequest>} A promise that resolves to the connection request model.
     * @throws {ApiError} If the request fails.
     */
    async initiate(
        data: any
    ): Promise<any> {
        return await client.connections.initiateConnection({body: data});
       
    }
}

export class ConnectionRequest {
    connectionStatus: string;
    connectedAccountId: string;
    redirectUrl: string | null;

    /**
     * Connection request model.
     * @param {string} connectionStatus The status of the connection.
     * @param {string} connectedAccountId The unique identifier of the connected account.
     * @param {string} [redirectUrl] The redirect URL for completing the connection flow.
     */
    constructor(connectionStatus: string, connectedAccountId: string, redirectUrl: string | null = null) {
        this.connectionStatus = connectionStatus;
        this.connectedAccountId = connectedAccountId;
        this.redirectUrl = redirectUrl;
    }

    /**
     * Save user access data.
     * @param {Composio} client The Composio client instance.
     * @param {Object} data The data to save.
     * @param {Object} data.fieldInputs The field inputs to save.
     * @param {string} [data.redirectUrl] The redirect URL for completing the connection flow.
     * @param {string} [data.entityId] The entity ID associated with the user.
     * @returns {Promise<Object>} The response from the server.
     */
    async saveUserAccessData(data: {
        fieldInputs: Record<string, string>;
        redirectUrl?: string;
        entityId?: string;
    }) {
        const connectedAccount = await apiClient.connections.getConnection({
            path:{
               connectedAccountId: this.connectedAccountId
            }
        });
        return apiClient.connections.initiateConnection({
            body: {
                // @ts-ignore
                integrationId: connectedAccount.integrationId,
                //@ts-ignore
                data: data.fieldInputs,
                redirectUri: data.redirectUrl,
                userUuid: data.entityId,
            } 
        });
    }

    /**
     * Wait until the connection becomes active.
     * @param {Composio} client The Composio client instance.
     * @param {number} [timeout=60] The timeout period in seconds.
     * @returns {Promise<ConnectedAccountModel>} The connected account model.
     * @throws {ComposioClientError} If the connection does not become active within the timeout period.
     */
    async waitUntilActive(timeout = 60) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout * 1000) {
            // @ts-ignore
            const connection = await apiClient.connections.getConnection({
                path: {
                    connectedAccountId: this.connectedAccountId
                }
            }).then(res=>res.data);
            //@ts-ignore
            if (connection.status === 'ACTIVE') {
                return connection;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        throw new Error(
            'Connection did not become active within the timeout period.'
        );
    }
}

