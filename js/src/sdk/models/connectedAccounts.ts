
import {  InitiateConnectionPayloadDto, GetConnectionsResponseDto, GetConnectionInfoData, GetConnectionInfoResponse, GetConnectionsData, InitiateConnectionData } from "../client";
import client from "../client/client";
import apiClient from "../client/client"
import { BackendClient } from "./backendClient";
import { CEG } from "../utils/error";

type ConnectedAccountsListData = GetConnectionsData['query'] & {appNames?: string};

type InitiateConnectionDataReq = InitiateConnectionPayloadDto & {
    data?: Record<string, unknown> | unknown;
    userUuid?: string;
    entityId?: string;
    labels?: string[];
    integrationId: string;
    redirectUri?: string;
}

export class ConnectedAccounts {
    backendClient: BackendClient;

    constructor(backendClient: BackendClient) {
        this.backendClient = backendClient; 
    }
    
    async list(data: ConnectedAccountsListData): Promise<GetConnectionsResponseDto> {
        try {
            const res = await apiClient.connections.getConnections({ query: data });
            return res.data!;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async create(data: InitiateConnectionPayloadDto) {
        try {
            const {data:res} = await apiClient.connections.initiateConnection({ body: data });
            //@ts-ignore
            return new ConnectionRequest(res.connectionStatus, res.connectedAccountId, res.redirectUrl);
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async get(data: { connectedAccountId: string }) {
        try {
            const res = await apiClient.connections.getConnection({ path: data });
            return res.data;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async delete(data: { connectedAccountId: string }) {
        try {
            const res = await apiClient.connections.deleteConnection({ path: data });
            return res.data;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async getAuthParams(data: { connectedAccountId: string }) {
        try {
            const res = await apiClient.connections.getConnection({ path: { connectedAccountId: data.connectedAccountId } });
            return res.data;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async initiate(payload: InitiateConnectionDataReq): Promise<ConnectionRequest> {
        try {
            const {integrationId, entityId = 'default', labels,data={}, redirectUri} = payload;
      
            const res = await client.connections.initiateConnection({ body: {
                integrationId,
                entityId,
                labels,
                redirectUri,
                data,
            }  }).then(res => res.data);
            
            return new ConnectionRequest(res?.connectionStatus!, res?.connectedAccountId!, res?.redirectUrl!)
        } catch (error) {
            throw CEG.handleError(error);
        }
    }
}

export class ConnectionRequest {
    connectionStatus: string;
    connectedAccountId: string;
    redirectUrl: string | null;

    constructor(connectionStatus: string, connectedAccountId: string, redirectUrl: string | null = null) {
        this.connectionStatus = connectionStatus;
        this.connectedAccountId = connectedAccountId;
        this.redirectUrl = redirectUrl;
    }

    async saveUserAccessData(data: {
        fieldInputs: Record<string, string>;
        redirectUrl?: string;
        entityId?: string;
    }) {
        try {
            const {data: connectedAccount} = await apiClient.connections.getConnection({ path: { connectedAccountId: this.connectedAccountId } });
            if(!connectedAccount) throw new Error("Connected account not found");
            return await apiClient.connections.initiateConnection({
                body: {
                    integrationId: connectedAccount.integrationId,
                    //@ts-ignore
                    data: data.fieldInputs,
                    redirectUri: data.redirectUrl,
                    userUuid: data.entityId,
                    entityId: data.entityId,
                }
            });
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async getAuthInfo(data: GetConnectionInfoData["path"]): Promise<GetConnectionInfoResponse> {
        try {
            const res = await client.connections.getConnectionInfo({ path: data });
            return res.data!;
        } catch (error) {
            throw CEG.handleError(error);
        }
    }

    async waitUntilActive(timeout = 60) {
        try {
            const startTime = Date.now();
            while (Date.now() - startTime < timeout * 1000) {
                const connection = await apiClient.connections.getConnection({ path: { connectedAccountId: this.connectedAccountId } }).then(res => res.data);
                if(!connection) throw new Error("Connected account not found");
                if (connection.status === 'ACTIVE') {
                    return connection;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            throw new Error('Connection did not become active within the timeout period.');
        } catch (error) {
            throw CEG.handleError(error);
        }
    }
}
