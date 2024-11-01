import { describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import { z } from "zod";
import { ActionRegistry } from "./actionRegistry";
import { Composio } from ".";
import { getTestConfig } from "../../config/getTestConfig";

describe("ActionRegistry", () => {
    let actionRegistry: ActionRegistry;
    let client: Composio;
    const testConfig = getTestConfig();

    beforeAll(() => {
        client = new Composio(testConfig.COMPOSIO_API_KEY!,testConfig.BACKEND_HERMES_URL!);
    });

    beforeEach(() => {
        actionRegistry = new ActionRegistry(client);
    });

    it("should create an action with valid parameters", async () => {
        const params = z.object({
            param1: z.string(),
            param2: z.string().optional(),
        });

        const callback = async (params: Record<string, any>) => {
            return { success: true };
        };

        const options = {
            actionName: "testAction",
            toolName: "testTool",
            description: "This is a test action",
            inputParams: params,
            callback,
        };

        const action = await actionRegistry.createAction(options);

        expect(action.parameters.title).toBe("testAction");
        expect(action.parameters.type).toBe("object");
        expect(action.parameters.description).toBe("This is a test action");
        expect(action.parameters.required).toEqual(["param1"]);
        expect(action.parameters.properties).toHaveProperty("param1");
        expect(action.parameters.properties).toHaveProperty("param2");
    });

    it("should throw an error if callback is not a function", async () => {
        const params = z.object({
            param1: z.string(),
        });

        const options = {
            actionName: "testAction1",
            toolName: "testTool",
            description: "This is a test action",
            params,
            callback: "notAFunction",
        };

        await expect(actionRegistry.createAction(options as any)).rejects.toThrow("Callback must be a function");
    });

    it("should throw an error if callback is an anonymous function and noActionName is specified", async () => {
        const params = z.object({
            param1: z.string(),
        });

        const options = {
            toolName: "testTool",
            description: "This is a test action",
            inputParams: params,
            callback: async function () { return { success: true }; },
        };

        await expect(actionRegistry.createAction(options)).rejects.toThrow("You must provide actionName for this action");
    });

    it("should execute an action with valid parameters", async () => {
        const params = z.object({
            param1: z.string(),
        });

        const callback = async (params: Record<string, any>) => {
            return { success: true };
        };

        const options = {
            actionName: "testAction2",
            description: "This is a test action",
            inputParams: params,
            callback,
        };

        await actionRegistry.createAction(options);

        const result = await actionRegistry.executeAction("testAction2", { param1: "value1" }, {});

        expect(result).toEqual({ success: true });
    });

    it("should throw an error if action does not exist", async () => {
        await expect(actionRegistry.executeAction("nonExistentAction", {}, {})).rejects.toThrow("Action with name nonExistentAction does not exist");
    });

    it("should get actions by names", async () => {
        const params = z.object({
            param1: z.string(),
        });

        const callback = async (params: Record<string, any>) => {
            return { success: true };
        };

        const options = {
            actionName: "testAction",
            toolName: "testTool",
            description: "This is a test action",
            inputParams: params,
            callback,
        };

        await actionRegistry.createAction(options);

        const actions = await actionRegistry.getActions({actions: ["testAction"]});
        expect(actions.length).toBe(1);
        expect(actions[0].parameters.properties).toHaveProperty("param1");
    });

    it("should return an empty array if no actions match the names", async () => {
        const actions = await actionRegistry.getActions({actions: ["nonExistentAction"]});

        expect(actions.length).toBe(0);
    });
});
