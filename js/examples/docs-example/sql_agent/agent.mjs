import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ComposioToolSet } from "composio-core";
import { pull } from "langchain/hub";

dotenv.config();

const composioToolset = new ComposioToolSet();

async function executeSQLQuery(query) {
    const sqlTools = await composioToolset.getTools({ apps: ["sqltool", "filetool"] });
    const llm = new ChatOpenAI({ model: "gpt-4-turbo" });
    const prompt = await pull("hwchase17/openai-functions-agent");
    const agent = await createOpenAIFunctionsAgent({ llm, tools: sqlTools, prompt });

    const agentExecutor = new AgentExecutor({
        agent,
        tools: sqlTools,
        verbose: true,
    });

    const result = await agentExecutor.invoke({
        input: `Execute the following SQL query and write the output to a file named 'output.txt': ${query}`
    });

    console.log("Query Result:", result.output);
    return result.output;
}

async function plotGraph(data) {
    const allTools = await composioToolset.getTools({ apps: ["sqltool", "filetool", "codeinterpreter"] });
    const llm = new ChatOpenAI({ model: "gpt-4-turbo" });
    const prompt = await pull("hwchase17/openai-functions-agent");
    const codeAgent = await createOpenAIFunctionsAgent({ llm, tools: allTools, prompt });
    const codeExecutor = new AgentExecutor({
        agent: codeAgent,
        tools: allTools,
        verbose: true,
    });

    const result = await codeExecutor.invoke({
        input: `Using the following data, plot a graph: ${data}`
    });

    console.log("Graph Result:", result.output);
    return result.output;
}

async function runSQLAgent() {
    const query = "SELECT * FROM users LIMIT 10";
    const queryResult = await executeSQLQuery(query);
    const graphResult = await plotGraph(queryResult);
}

runSQLAgent().catch(error => console.error("An error occurred:", error));
