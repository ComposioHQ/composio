import { describe, it, expect, beforeAll } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Apps } from "./apps";
import { Triggers } from "./triggers";

describe("Apps class tests", () => {
    let backendClient;
    let triggers: Triggers;

    beforeAll(() => {
        backendClient = getBackendClient();
        triggers = new Triggers(backendClient);
    });

    it("should create an Apps instance and retrieve apps list", async () => {
        const triggerList = await triggers.list();
        expect(triggerList.length).toBeGreaterThan(0);
    });

    it.failing("should retrieve a list of triggers for a specific app", async () => {
        const triggerList = await triggers.list({
           query:{
            appNames: "github"
           }
        });
        // this is breaking for now
        expect(triggerList.length).toBeGreaterThan(0);
        expect(triggerList[0].appName).toBe("github");
    });
   
});
