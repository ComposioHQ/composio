import { describe, it, expect, beforeAll } from "@jest/globals";
import { getBackendClient } from "../testUtils/getBackendClient";

import { Triggers } from "./triggers";
import { ConnectedAccounts } from "./connectedAccounts";
import { Entity } from "./Entity";

describe("Apps class tests", () => {
    let backendClient;
    let triggers: Triggers;
    let connectedAccounts: ConnectedAccounts;
    let entity: Entity;

    let triggerId: string;

    beforeAll(() => {
        backendClient = getBackendClient();
        triggers = new Triggers(backendClient);
        connectedAccounts = new ConnectedAccounts(backendClient);
        entity = new Entity(backendClient, "default");
    });

    it("should create an Apps instance and retrieve apps list", async () => {
        const triggerList = await triggers.list();
        expect(triggerList.length).toBeGreaterThan(0);
    });

    it("should retrieve a list of triggers for a specific app", async () => {
        const triggerList = await triggers.list({
            appNames: "github"
        });
        // this is breaking for now
        expect(triggerList.length).toBeGreaterThan(0);
        expect(triggerList[0].appName).toBe("github");
    });


});


describe("Apps class tests subscribe", () => {
    let backendClient;
    let triggers: Triggers;
    let connectedAccounts: ConnectedAccounts;
    let entity: Entity;

    let triggerId: string;

    beforeAll(() => {
        backendClient = getBackendClient();
        triggers = new Triggers(backendClient);
        connectedAccounts = new ConnectedAccounts(backendClient);
        entity = new Entity(backendClient, "default");
    });



    it("should create a new trigger for gmail", async () => {
        const connectedAccount = await connectedAccounts.list({ query: { user_uuid: 'default' } });

        const connectedAccountId = connectedAccount.items.find(item => item.appName === 'gmail')?.id;
        const trigger = await triggers.setup(connectedAccountId, 'gmail_new_gmail_message', {
            "userId": connectedAccount.items[0].id,
            "interval": 60,
            "labelIds": "INBOX",
        },);

        expect(trigger.status).toBe("success");
        expect(trigger.triggerId).toBeTruthy();

        triggerId = trigger.triggerId;
    })

    it("should disable, enable, and then disable the created trigger", async () => {
        let trigger = await triggers.disable({ triggerId });
        expect(trigger.status).toBe("success");

        trigger = await triggers.enable({ triggerId });
        expect(trigger.status).toBe("success");

        trigger = await triggers.disable({ triggerId });
        expect(trigger.status).toBe("success");
    });

    it("should subscribe to a trigger", async () => {
        await triggers.subscribe((data) => {
            // Explicitly passing the data to an empty function body
        }, {
            appName: "gmail",
            triggerId: triggerId
        });

        await triggers.unsubscribe();

    });

});
