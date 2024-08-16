import { describe, it, expect, beforeAll } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { ActiveTriggers } from "./activeTriggers";

describe("Apps class tests", () => {
    let backendClient;
    let activeTriggers: ActiveTriggers;
  
    beforeAll(() => {
        backendClient = getBackendClient();
        activeTriggers = new ActiveTriggers(backendClient);

    });

    it("should get a specific action", async () => {
        const activeTriggersList = await activeTriggers.list();
        expect(activeTriggersList).toBeInstanceOf(Array);
        expect(activeTriggersList).not.toHaveLength(0);
    });

    it("should get a list of actions", async () => {
        const activeTriggersList = await activeTriggers.list();
        const firstTrigger= activeTriggersList[0];
        const activeTrigger = await activeTriggers.get({ path:{
                triggerId: firstTrigger.id
            }
        });
        expect(activeTrigger).toBeDefined();
    });

});
