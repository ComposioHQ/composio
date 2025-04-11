import { describe, expect, it } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Entity } from "./Entity";
import { ConnectedAccounts } from "./connectedAccounts";
import { Integrations } from "./integrations";

describe("Entity class tests", () => {
  const backendClient = getBackendClient();
  let entity: Entity;
  let triggerId: string;
  let connectedAccounts: ConnectedAccounts;
  let _integrations: Integrations;

  beforeAll(() => {
    entity = new Entity(backendClient, "default");
    connectedAccounts = new ConnectedAccounts(
      backendClient,
      backendClient.instance
    );
    _integrations = new Integrations(backendClient, backendClient.instance);
  });

  it("should create an Entity instance with 'default' id", () => {
    expect(entity).toBeInstanceOf(Entity);
    expect(entity.id).toBe("default");
  });

  it("should create for different entities", async () => {
    const entityId = "test-entity";
    const entity2 = new Entity(backendClient, entityId);
    const connection = await entity2.initiateConnection({
      appName: "github",
      authMode: "OAUTH2",
    });
    expect(connection.connectionStatus).toBe("INITIATED");

    const connection2 = await connectedAccounts.get({
      connectedAccountId: connection.connectedAccountId,
    });
    if (!connection2) throw new Error("Connection not found");
    expect(connection2.entityId).toBe(entityId);
  });

  it("get connection for github", async () => {
    const app = "github";
    const connection = await entity.getConnection({ app });
    expect(connection?.appUniqueId).toBe(app);
  });

  it("get connection for rand", async () => {
    const entity2 = new Entity(backendClient, "ckemvy" + Date.now());
    let hasError = false;
    try {
      const connection = await entity2.getConnection({ app: "gmail" });
      expect(connection?.appUniqueId).toBe("gmail");
    } catch (error) {
      hasError = true;
    }
    expect(hasError).toBe(true);
  });

  it("execute action", async () => {
    const connectedAccount = await entity.getConnection({ app: "github" });

    expect(connectedAccount).toHaveProperty("id");
    expect(connectedAccount).toHaveProperty("appUniqueId", "github");
    const actionName = "GITHUB_GITHUB_API_ROOT".toLowerCase();
    const requestBody = {};

    const executionResult = await entity.execute({
      actionName,
      params: requestBody,
      connectedAccountId: connectedAccount?.id,
    });
    expect(executionResult).toBeDefined();
    expect(executionResult).toHaveProperty("successfull", true);
    expect(executionResult).toHaveProperty("data.authorizations_url");
  });

  it("should have an Id of a connected account with label - primary", async () => {
    const entityW2Connection = new Entity(backendClient, "ckemvy");

    const entity = new Entity(backendClient, "ckemvy");

    // Remove test with normal app where reinitiate connection is not needed
    // await entity.initiateConnection({
    //   appName: "github",
    // });
    // const getConnection = await entity.getConnection({
    //   app: "github",

    // });
    // expect(getConnection).toHaveProperty("id");
  });

  it("should have an Id of a connected account with default - primary", async () => {
    const entityW2Connection = new Entity(backendClient, "default");

    const entity = new Entity(backendClient, "default");

    const getConnection = await entity.getConnection({
      app: "github",
    });
    expect(getConnection).toHaveProperty("id");
  });

  it("get connections", async () => {
    const connections = await entity.getConnections();
    expect(connections.length).toBeGreaterThan(0);
  });

  it("setup trigger", async () => {
    const trigger = await entity.setupTrigger({
      app: "gmail",
      triggerName: "gmail_new_gmail_message",
      config: { userId: "me", interval: 60, labelIds: "INBOX" },
    });

    triggerId = trigger.triggerId;
    expect(trigger.status).toBe("success");
    expect(trigger.triggerId).toBeDefined();
  });

  it("disable trigger", async () => {
    const trigger = await entity.disableTrigger(triggerId);
    expect(trigger.status).toBe("success");
  });

  it("initiate connection", async () => {
    const connection = await entity.initiateConnection({
      appName: "github",
      authMode: "OAUTH2",
    });
    expect(connection.connectionStatus).toBe("INITIATED");
  });
});
