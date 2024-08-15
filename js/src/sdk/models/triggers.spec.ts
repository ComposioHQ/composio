import { describe, it, expect, beforeAll } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";
import { Apps } from "./apps";

describe("Apps class tests", () => {
    let backendClient;
    let apps: Apps;

    beforeAll(() => {
        backendClient = getBackendClient();
        apps = new Apps(backendClient);
    });

    it("should create an Apps instance and retrieve apps list", async () => {
        const appsList = await apps.list();
        expect(appsList).toBeInstanceOf(Array);
        expect(appsList).not.toHaveLength(0);

        const firstItem = appsList[0];
        expect(firstItem).toHaveProperty('appId');
        expect(firstItem).toHaveProperty('key');
        expect(firstItem).toHaveProperty('name');
    });

   
});
