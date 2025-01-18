import { ChatOpenAI } from "@langchain/openai";
import { LangchainToolSet } from "composio-core";
import dotenv from "dotenv";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { heliconeParams } from "../utils.mjs";

dotenv.config();

const llm = new ChatOpenAI(
  {
    model: "gpt-3.5-turbo",
    apiKey: process.env.OPENAI_API_KEY,
  },
  // Remove Helicone params if you don't want to use it
  heliconeParams
);

const toolset = new LangchainToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tools = await toolset.getTools({
  actions: ["HUBSPOT_LIST_CONTACTS_PAGE", "GMAIL_CREATE_EMAIL_DRAFT"],
});

const prompt = await pull("hwchase17/openai-functions-agent");

const agent = await createOpenAIFunctionsAgent({
  llm,
  tools,
  prompt,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  verbose: false,
});
const result = await agentExecutor.invoke({
  input: `Draft an email for each lead in my Hubspot contacts page introducing yourself and asking them if they're interested in integrating AI Agents in their workflow.`,
});
console.log("🎉Output from agent: ", result.output);
