import express from 'express';
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import dotenv from 'dotenv';
import { LangchainToolSet } from "composio-core";

dotenv.config()
const app = express();
const PORT = process.env.PORT || 2001;

app.use(express.json());

(async () => {
    try {
        const llm = new ChatOpenAI({
            model: "gpt-4-turbo",
        });

        const toolset = new LangchainToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });

        const tools = await toolset.get_actions({
            actions: ["EXA_SEARCH", "GMAIL_CREATE_EMAIL_DRAFT"]
        });

        const prompt = await pull("hwchase17/openai-functions-agent");

        // Debugging logs
        //console.log("LLM:", llm);
        console.log("Tools:", tools);
        //console.log("Prompt:", prompt);

        const additional = `
            "You are a Lead Outreach Agent that is equipped with great tools for research "
            "and is an expert writer. Your job is to first research some info about the lead "
            "given to you and then draft a perfect ideal email for whatever input task is given to you. "
            "Always write the subject, content of the email and nothing else."`;

        // Check combined_prompt

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
        const my_details = "I am Karan Vaidya, the founder of Composio"
        const lead_details = "John Doe, a marketing manager at Acme Corp, interested in our SaaS solutions.";
        const purpose = "to introduce our new product features and schedule a demo.";
        const result = await agentExecutor.invoke({
            input: `${additional}
            These are the lead details that we know ${lead_details}. This is the purpose to write the email:${purpose}. Write a well written email for the purpose to the lead.
            Create a draft in gmail. research on the lead
            My details: ${my_details}
            `
        });

    } catch (error) {
        console.error(error);
    }
})();
