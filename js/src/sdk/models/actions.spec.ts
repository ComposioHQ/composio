import { beforeAll, describe, expect, it } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Actions } from "./actions";
import { ConnectedAccounts } from "./connectedAccounts";

describe("Actions class tests", () => {
  let backendClient;
  let actions: Actions;
  let connectedAccouns: ConnectedAccounts;

  beforeAll(() => {
    backendClient = getBackendClient();
    actions = new Actions(backendClient, backendClient.instance);
    connectedAccouns = new ConnectedAccounts(
      backendClient,
      backendClient.instance
    );
  });

  it("should get a specific action", async () => {
    const actionName = "GITHUB_GITHUB_API_ROOT";
    const action = await actions.get({ actionName: actionName.toLowerCase() });
    expect(action).toHaveProperty("name", actionName);
  });

  it("should get a list of actions", async () => {
    const actionsList = await actions.list();
    expect(actionsList.items).toBeInstanceOf(Array);
    expect(actionsList.items).not.toHaveLength(0);
  });

  it("should get a list of actions from integrated apps in an account", async () => {
    const actionsList = await actions.list({
      filterByAvailableApps: true,
    });
    expect(actionsList.items).toBeInstanceOf(Array);
    expect(actionsList.items).not.toHaveLength(0);
  });

  it("should execute an action with a connected account for GitHub", async () => {
    const actionName = "GITHUB_GITHUB_API_ROOT".toLowerCase();
    const connectedAccountsResult = await connectedAccouns.list({
      appNames: "github",
      status: "ACTIVE",
    });
    expect(connectedAccountsResult.items).not.toHaveLength(0);
    const connectionId = connectedAccountsResult.items[0].id;

    const executionResult = await actions.execute({
      actionName: actionName,
      requestBody: {
        connectedAccountId: connectionId,
        input: {},
        appName: "github",
      },
    });

    expect(executionResult).toHaveProperty("successfull", true);
    expect(executionResult.data).toHaveProperty("authorizations_url");
  });

  it("should execute an action of noauth app", async () => {
    const actionName = "COMPOSIO_LIST_APPS";

    const executionResult = await actions.execute({
      actionName,
      requestBody: {
        appName: "composio",
      },
    });

    expect(executionResult).toHaveProperty("successfull", true);
  });

  it("should get a list of actions by use case", async () => {
    const actionsList = await actions.findActionEnumsByUseCase({
      apps: ["github", "notion"],
      useCase: "create issue from github repo on notion",
    });
    expect(actionsList).toBeInstanceOf(Array);
    expect(actionsList).not.toHaveLength(0);
  });
});
