
import { ConnectionsControllerGetConnectionsData, ConnectionsControllerGetConnectionData, ConnectionsControllerGetConnectionsResponse, GetConnectionsResponseDto } from "../client";
import client from "../client/client";
import apiClient from "../client/client"
import { BackendClient } from "./backendClient";

export class ConnectedAccounts {
    backendClient: BackendClient;

    constructor(backendClient: BackendClient) {
        this.backendClient = backendClient; 
    }
    
    list(data: Record<string, any> = {}): Promise<GetConnectionsResponseDto>{
        return apiClient.connections.getConnections({
            query: data
        }).then(res=>{
            return res.data!
        })

    }

     create(data: any = {}): any {
        return apiClient.connections.initiateConnection({
            body: data
        }).then(res=>res.data)
    }

    get(data: { connectedAccountId :string}) {
        return apiClient.connections.getConnection({
            path: data
        }).then(res => res.data)
    }

    async initiate(
        data: any
    ): Promise<ConnectionRequest> {
        const res =  await client.connections.initiateConnection({ body: data }).then(res => res.data)

        //@ts-ignore
        return new ConnectionRequest(res?.connectionStatus!, res?.connectedAccountId!, res?.redirectUrl!)
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

