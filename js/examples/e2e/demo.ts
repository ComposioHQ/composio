
import { Composio, LangchainToolSet } from "composio-core";

const toolset = new LangchainToolSet();

(async() => {
    console.log("Creating action");
    await toolset.createAction({
        actionName: "helloWorld",
        description: "This is a test action for handling hello world",
        callback: async () => {
            return "Hello World from the function";
        }
    });

    console.log("Tools are registered", toolset.getTools());
})


