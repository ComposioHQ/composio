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

});
