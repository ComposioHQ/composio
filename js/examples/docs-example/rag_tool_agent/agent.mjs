import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ComposioToolSet } from "composio-core";
import { pull } from "langchain/hub";

dotenv.config();

const llm = new ChatOpenAI({ model: "gpt-4o" });
const composioToolset = new ComposioToolSet();
const tools = await composioToolset.getTools({ apps: ["ragtool"] });

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
