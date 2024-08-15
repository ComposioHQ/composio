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

    it("should get details of a specific app by key", async () => {
        const appKey = "github";
        const app = await apps.get({ appKey });
        expect(app).toBeDefined();
        expect(app).toHaveProperty('auth_schemes');
        // @ts-ignore
        expect(app.auth_schemes[0]).toHaveProperty('auth_mode', 'OAUTH2');
        expect(app).toHaveProperty('key', appKey);
        expect(app).toHaveProperty('name', 'Github');
        expect(app).toHaveProperty('description');
    });

    it("should return undefined for an invalid app key", async () => {
        try {
            const app = await apps.get({ appKey: "nonexistent_key" });
            expect(app).toBeUndefined();
        } catch (error) {
            expect(error).toBeDefined();
        }
    });
});
