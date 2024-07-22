import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ComposioToolSet, App } from "composio-core";
import { pull } from "langchain/hub";

dotenv.config();

// Initialize the language model with OpenAI API key and model name
const llm = new ChatOpenAI({ model: "gpt-4o" });

// Setup tools using ComposioToolSet
const composioToolset = new ComposioToolSet();
const tools = await composioToolset.getTools({ apps: [App.SERPAPI] });

const prompt = await pull("hwchase17/openai-functions-agent");

const agent = await createOpenAIFunctionsAgent({
    llm,
    tools,
    prompt,
});

const agentExecutor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
});

async function runInvestmentAnalysis(topic) {
    const result = await agentExecutor.invoke({
        input: `Conduct a comprehensive investment analysis on ${topic}. 
                First, research the topic using SERP to get the latest information. 
                Then, analyze the gathered information for investment insights. 
                Finally, provide investment recommendations, listing pros and cons as bullet points.`
    });

    console.log(result.output);
    return result.output;
}

// Example usage
const topic = "Tesla stock";
runInvestmentAnalysis(topic);
