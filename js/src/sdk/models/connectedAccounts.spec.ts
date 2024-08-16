import { describe, it, expect, beforeAll } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { ConnectedAccounts } from "./connectedAccounts";

describe("ConnectedAccounts class tests", () => {
    let backendClient;
    let connectedAccounts: ConnectedAccounts;

    beforeAll(() => {
        backendClient = getBackendClient();
        connectedAccounts = new ConnectedAccounts(backendClient);
    });

    it("should create a ConnectedAccounts instance and retrieve connections list", async () => {
        // @ts-ignore
        const connectionsData: TConnectionData = {
            appNames: 'github'
        };
        const connectionsList = await connectedAccounts.list(connectionsData);
        expect(connectionsList.items).toBeInstanceOf(Array);
        expect(connectionsList.items).not.toHaveLength(0);

        // @ts-ignore
        const firstConnection = connectionsList.items[0];
        expect(firstConnection.appName).toBe('github');
        expect(firstConnection).toHaveProperty('clientUniqueUserId');
        expect(firstConnection).toHaveProperty('status');
        expect(firstConnection).toHaveProperty('connectionParams');
    });


    it("should retrieve a specific connection", async () => {

        // @ts-ignore
        const connectionsData: TConnectionData = {
            appNames: 'github'
        };
        const connectionsList = await connectedAccounts.list(connectionsData);
      
        const connectionId = connectionsList.items[0].id;

        const connection = await connectedAccounts.get({ connectedAccountId: connectionId });
        // @ts-ignore
        expect(connection.id).toBe(connectionId);
    });

    it("should retrieve a specific connection for entity", async () => {
        // @ts-ignore
        const connectionsData: TConnectionData = {
            user_uuid: 'default'
        };
        const connectionsList = await connectedAccounts.list(connectionsData);

        const connectionId = connectionsList.items[0].id;

        const connection = await connectedAccounts.get({ connectedAccountId: connectionId });
        // @ts-ignore
        expect(connection.id).toBe(connectionId);
    });

});
