import { Composio } from "@composio/core";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { VercelToolset } from "@composio/vercel";

const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    toolset: new VercelToolset(),
    userId: process.env.COMPOSIO_USER_ID, // pass the user at the global level
});



/**
 * For tools that have manual execute, we need to pass userId while executing the tool
 */
// @ts-ignore
const result = composio.toolset.handleToolCall(tool, { userId: process.env.COMPOSIO_USER_ID });

/**
 * For tools that have auto execute, we have to pass userId (required)
 */
const tools = await composio.getTools({
    // @ts-ignore
    filters: {},
    userId: process.env.COMPOSIO_USER_ID, // this is mandatory
    connectedAccountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID, // this is optional
});


/**
 * If the user wants to change the userId for a specifically fetched tool
 */
// @ts-ignore
const tool = await composio.wrapTool(
    // @ts-ignore
    hackerNewsTool,
    { userId: process.env.COMPOSIO_USER_ID }
);

