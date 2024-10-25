import { Composio, LangchainToolSet } from "composio-core";
import { z } from "zod";

const toolset = new LangchainToolSet();

(async() => {
    console.log("Creating action");
    await toolset.createAction({
        actionName: "helloWorld",
        description: "This is a test action for handling hello world",
        params: z.object({
            name: z.string().optional()
        }),
        callback: async (params) => {
            const { name } = params;
            return `Hello ${name || "World"} from the function`;
        }
    });
    console.log("Tools are registered", await toolset.getTools({actions: ["helloWorld"]}));

    // Sending params to the action
    const result = await toolset.executeAction("helloWorld", { name: "Alice" }, {});
    console.log("Action result:", result);
})();