import { describe, it, expect, beforeAll } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Actions } from "./actions";
import { Entity } from "./Entity";
import { ConnectedAccounts } from "./connectedAccounts";

describe("Apps class tests", () => {
    let backendClient;
    let actions: Actions;
    let connectedAccouns: ConnectedAccounts

    beforeAll(() => {
        backendClient = getBackendClient();
        actions = new Actions(backendClient);
        connectedAccouns = new ConnectedAccounts(backendClient);
    });

    it("should get a specific action", async () => {
        const actionName = "GITHUB_GITHUB_API_ROOT";
        const action = await actions.get({ actionName: actionName.toLowerCase() });
        expect(action).toHaveProperty('name', actionName);
    });

    it("should get a list of actions", async () => {
        const actionsList = await actions.list();
        expect(actionsList.items).toBeInstanceOf(Array);
        expect(actionsList.items).not.toHaveLength(0);
    });

    it("should execute an action with a connected account for GitHub", async () => {

        const actionName = "GITHUB_GITHUB_API_ROOT".toLowerCase();
        const connectedAccountsResult = await connectedAccouns.list({ appNames: 'github', status: 'ACTIVE' });
        expect(connectedAccountsResult.items).not.toHaveLength(0);
        const connectionId = connectedAccountsResult.items[0].id;

        const executionResult = await actions.execute({
            actionName: actionName,
            requestBody: {
                connectedAccountId: connectionId,
                input: {},
                appName: 'github'
            }
        });

        expect(executionResult).toHaveProperty('successfull', true);
        expect((executionResult as any).data).toHaveProperty('authorizations_url');
    });

    it("should execute an action of noauth app", async () => {
        const actionName = "codeinterpreter_execute_code";
        const input = { code_to_execute: 'print("Hello World");' };

        const executionResult = await actions.execute({
            actionName,
            requestBody: {
                input: input,
                appName: "codeinterpreter",
            }
        });

        expect(executionResult).toHaveProperty('successfull', true);
        //@ts-ignore
        expect((executionResult as any).data).toHaveProperty('stdout', 'Hello World\n');
        expect((executionResult as any).data).toHaveProperty('stderr', '');
    });
});
