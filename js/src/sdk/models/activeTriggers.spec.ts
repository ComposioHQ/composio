import { beforeAll, describe, expect, it } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { ActiveTriggers } from "./activeTriggers";

describe("Active Triggers class tests", () => {
  let backendClient;
  let activeTriggers: ActiveTriggers;

  beforeAll(() => {
    backendClient = getBackendClient();
    activeTriggers = new ActiveTriggers(backendClient, backendClient.instance);
  });

  it("should retrieve a list of active triggers", async () => {
    const activeTriggersList = await activeTriggers.list();
    expect(activeTriggersList).toBeInstanceOf(Array);
    expect(activeTriggersList).not.toHaveLength(0);
  });

  it("should retrieve details of a specific active trigger", async () => {
    const activeTriggersList = await activeTriggers.list();
    const firstTrigger = activeTriggersList[0];

    if (!firstTrigger.id) {
      throw new Error("Trigger ID is required");
    }
    const activeTrigger = await activeTriggers.get({
      triggerId: firstTrigger.id as string,
    });
    expect(activeTrigger).toBeDefined();
  });
});
