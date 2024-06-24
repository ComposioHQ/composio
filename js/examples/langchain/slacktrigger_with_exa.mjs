// Import required libraries
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import { LangchainToolSet } from "composio-core";

// Create an instance of LangchainToolSet
const toolset = new LangchainToolSet({ apiKey: process.env.COMPOSIO_API_KEY });

// Main function to execute the agent
async function executeAgent(entityName, eventBody) {
    // Step 1: Get the entity from the toolset
    const entity = await toolset.client.getEntity(entityName);

    // Step 2: Get the tools for Exa search and posting a message to Slack
    const tools = await toolset.get_actions({ actions: ["slackbot_chat_post_message", "exa_search"] }, entity.id);

    // Step 3: Pull the prompt for the OpenAI Functions Agent
    const prompt = await pull("hwchase17/openai-functions-agent");

    // Step 4: Create an instance of ChatOpenAI
    const llm = new ChatOpenAI({ model: "gpt-4o", apiKey: process.env.OPEN_AI_API_KEY });

    // Step 5: Prepare the input data
    const body = `We received the following data: ${JSON.stringify(eventBody)}`;
    const agent = await createOpenAIFunctionsAgent({ llm, tools: tools, prompt });

    // Step 7: Create an instance of the AgentExecutor and invoke the agent
    const agentExecutor = new AgentExecutor({ agent, tools, verbose: true, });
    await agentExecutor.invoke({ input: "Reply to message on slack, to answer question, use exa_search to answer question and use emoji to reply and links of " + JSON.stringify(body) });
}

// Step 9: Subscribe to triggers and execute the agent if the trigger is a Slack mention
toolset.client.triggers.subscribe((data) => {
    console.log("trigger received", data);
   
    executeAgent("default", data.payload.event);
});
