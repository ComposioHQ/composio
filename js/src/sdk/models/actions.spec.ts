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
        const actionName = "GITHUB_GITHUB_API_ROOT".toLowerCase();
        const action = await actions.get({ actionName });
        expect(action).toHaveProperty('name', actionName);
    });

    it("should get a list of actions", async () => {
        const actionsList = await actions.list();
        expect(actionsList.items).toBeInstanceOf(Array);
        expect(actionsList.items).not.toHaveLength(0);
    });

    it("should execute an action with a connected account for GitHub", async () => {

        const actionName = "GITHUB_GITHUB_API_ROOT".toLowerCase();
        const connectedAccountsResult = await connectedAccouns.list({query:{ appNames: ['github'] }});
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

        expect(executionResult).toHaveProperty('execution_details.executed', true);
        expect(executionResult).toHaveProperty('response_data.authorizations_url');
    });

    it("should execute an action of noauth app", async () => {
        return;
        const actionName = "codeinterpreter_execute_code";
        const input = { code_to_execute: 'print("Hello World");' };

        const executionResult = await actions.execute({
            actionName,
            requestBody: {
                input: input,
                appName: "codeinterpreter",
            }
        });

        expect(executionResult).toHaveProperty('execution_details.executed', true);
        //@ts-ignore
        const parsedResponseData = JSON.parse(executionResult.response_data);
        expect(parsedResponseData).toHaveProperty('stdout', 'Hello World\n');
        expect(parsedResponseData).toHaveProperty('stderr', '');
    });
});
