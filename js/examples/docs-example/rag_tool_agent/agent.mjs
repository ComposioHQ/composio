import dotenv from 'dotenv';
dotenv.config();

import { ExecEnv, LangchainToolSet } from 'composio-core';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { pull } from 'langchain/hub';

(async () => {

    // Initialize the language model with OpenAI API key and model name
    const llm = new ChatOpenAI({ model: "gpt-4-turbo" });

    // Setup tools using ComposioToolSet
    const composioToolset = new LangchainToolSet({
        apiKey: process.env.COMPOSIO_API_KEY,
        workspaceEnv: ExecEnv.DOCKER
    });

    const tools = await composioToolset.get_actions({
        actions: ["ragtool_add_content", "ragtool_query"]
    });

    const prompt = await pull("hwchase17/openai-functions-agent");

    const agent = await createOpenAIToolsAgent({
        llm,
        tools,
        prompt,
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
    });

    async function addContentToRAG(content) {
        const result = await agentExecutor.invoke({
            input: `Add the following content to the RAG tool to enrich its knowledge base: ${content}`
        });
        console.log(result.output);
        return result.output;
    }

    async function queryRAG(userQuery) {
        const result = await agentExecutor.invoke({
            input: `Formulate a query based on this input: ${userQuery}. 
                    Retrieve relevant information using the RAG tool and return the results.`
        });
        console.log(result.output);
        return result.output;
    }

    // Example content to add
    const additionalContentList = [
        "Paris is the capital of France. It is known for its art, fashion, and culture.",
        "Berlin is the capital of Germany. It is famous for its history and vibrant culture.",
        "Tokyo is the capital of Japan. It is known for its technology and cuisine.",
        "Canberra is the capital of Australia. It is known for its modern architecture and museums.",
    ];

    // Add content to RAG tool
    for (const content of additionalContentList) {
        await addContentToRAG(content);
    }

    // Example query
    const userQuery = "What is the capital of France?";
    const queryResult = await queryRAG(userQuery);
    console.log("Query Result:", queryResult);
})();
