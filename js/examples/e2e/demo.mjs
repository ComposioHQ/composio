import { Composio, LangchainToolSet } from "composio-core";
import { z } from "zod";
import pkg from "dotenv";
const { config } = pkg;

config();

const toolset = new LangchainToolSet({});

(async() => {
    console.log("Creating action");
    try {
    await toolset.createAction({
        actionName: "helloWorld",
        description: "This is a test action for handling hello world",
        inputParams: z.object({
            name: z.string().optional()
        }),
        callback: async (params) => {
            const { name } = params;
            return {
                successful: true,
                data: {
                    name: name || "World"
                }
            }
        }
    });

    console.log("Tools are registered", await toolset.getTools({
        actions: ["helloWorld"]
    }));
    } catch (error) {
        console.error("Error creating action", error);
    }
})();