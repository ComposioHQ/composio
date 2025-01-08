import express from 'express';
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";

import { LangchainToolSet } from "composio-core";
import 'dotenv/config'


const app = express();
const PORT = process.env.PORT || 2001;

app.use(express.json());

(async () => {
    try {
        const task = "Fetch issue #960 from the repo composiohq/composio"

        const llm = new ChatOpenAI({
            model: "gpt-4-turbo",
        });

        const toolset = new LangchainToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });

        const tools = await toolset.getTools({
            actions: ["GITHUB_GET_AN_ISSUE"]
        });
        const prompt = await pull(
            "hwchase17/openai-functions-agent"
        );

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

        const result = await agentExecutor.invoke({
            input: task
        });

    } catch (error) {
        console.error(error);
    }
})();
