import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { LangchainToolSet } from "composio-core";

dotenv.config();

// Initialize the language model
const llm = new ChatOpenAI({ model: "gpt-4-turbo"});

// Define tools for the agents
const composioToolset = new LangchainToolSet({
    apiKey: process.env.COMPOSIO_API_KEY
});

// Retrieve the current date and time
const getCurrentDate = () => new Date().toISOString().split('T')[0];
const getTimezone = () => new Date().toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2];

const date = getCurrentDate();
const timezone = getTimezone();

// Setup Todo
const todo = `
    1PM - 3PM -> Code solo
`;

async function runAgent() {
    const tools = await composioToolset.getTools({
        actions: ["googlecalendar_create_event", "googlecalendar_list_events"]
    });

    const prompt = await pull("hwchase17/openai-functions-agent");
    const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
    });

    const result = await agentExecutor.invoke({
        input: `Book slots according to this todo list: ${todo}. 
                Label them with the work provided to be done in that time period. 
                Schedule it for today. Today's date is ${date} (it's in YYYY-MM-DD format) 
                and make the timezone be ${timezone}.`
    });

    console.log(result.output);
    return "Agent execution completed";
}

runAgent().then(console.log).catch(console.error);
