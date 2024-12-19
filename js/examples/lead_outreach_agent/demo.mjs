import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import dotenv from 'dotenv';
import { LangchainToolSet } from "composio-core";

dotenv.config();



const llm = new ChatOpenAI({
    model: "gpt-4-turbo",
    apiKey: process.env.OPENAI_API_KEY,
});

const toolset = new LangchainToolSet({
    apiKey: process.env.COMPOSIO_API_KEY,
});

const tools = await toolset.getTools({
    actions: ["HUBSPOT_LIST_CONTACTS_PAGE", "GMAIL_CREATE_EMAIL_DRAFT"]
});

const prompt = await pull("hwchase17/openai-functions-agent");

// Debugging logs
//console.log("LLM:", llm);
//console.log("Tools:", tools);
//console.log("Prompt:", prompt);

const additional = `
    "You are a Lead Outreach Agent that is has access to the CRM through HubSpot."
    "and is an expert writer. Your job is to first research some info about the lead "
    "given to you and then draft a perfect ideal email template for whatever input task is given to you. "
    `;

// Check combined_prompt

const agent = await createOpenAIFunctionsAgent({
    llm,
    tools,
    prompt,
});

const agentExecutor = new AgentExecutor({
    agent,
    tools,
    verbose: false, // Change it to true for debugging
});
const result = await agentExecutor.invoke({
    input: `Draft an email for each lead in my Hubspot contacts page introducing yourself and asking them if they're interested in integrating AI Agents in their workflow.`
});
console.log('🎉Output from agent: ', result.output);
