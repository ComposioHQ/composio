import express from 'express';
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";

import { LangchainToolSet, ExecEnv } from "composio-core";

const app = express();
const PORT = process.env.PORT || 2001;

app.use(express.json());

(async () => {
    try {
        const body = "TITLE: HELLO WORLD, DESCRIPTION: HELLO WORLD for the repo - utkarsh-dixit/speedy"

        const llm = new ChatOpenAI({
            model: "gpt-4-turbo",
        });

        const toolset = new LangchainToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
            workspaceEnv: ExecEnv.DOCKER
        });

        const tools = await toolset.get_actions({
            actions: ["filetool_write_file"]
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
            input: "Write a file named test.txt with the content Hello World"
        });

    } catch (error) {
        console.error(error);
    }
})();
