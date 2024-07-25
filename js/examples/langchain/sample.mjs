import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import { LangchainToolSet } from "composio-core";

const toolset = new LangchainToolSet({ apiKey: process.env.COMPOSIO_API_KEY});

async function setupUserConnectionIfNotExists(entityId) {
    const entity = await toolset.client.getEntity(entityId);
    const connection = await entity.getConnection('github');
    if (!connection) {
        const connection = await entity.initiateConnection('github');
        console.log("Log in via: ", connection.redirectUrl);
        return connection.waitUntilActive(60);
    }
    return connection;
}

async function executeAgent(entityName) {
    // Create entity and get tools
    const entity = await toolset.client.getEntity(entityName)
    await setupUserConnectionIfNotExists(entity.id);
    const tools = await toolset.get_actions({ actions: ["github_issues_create"] }, entity.id);

    const prompt = await pull("hwchase17/openai-functions-agent");
    const llm = new ChatOpenAI({
        model: "gpt-4-turbo",
        apiKey: process.env.OPEN_AI_API_KEY
    });


    const body = `TITLE: Sample issue, DESCRIPTION: Sample issue for the repo - himanshu-dixit/custom-repo-breaking`
    const agent = await createOpenAIFunctionsAgent({
        llm,
        tools: tools,
        prompt,
    });

    const agentExecutor = new AgentExecutor({ agent, tools, verbose: true, });
    const result = await agentExecutor.invoke({
        input: "Please create another github issue with the summary and description with the following details of another issue:- , " + JSON.stringify(body)
    });

    console.log(result.output)
}

executeAgent("himanshu")