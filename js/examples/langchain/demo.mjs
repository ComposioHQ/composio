import express from 'express';
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";

import { LangchainToolSet } from "composio-core";

const toolset = new LangchainToolSet({
    apiKey: process.env.COMPOSIO_API_KEY,
});

async function setupUserConnectionIfNotExists(entityId) {
    const entity = await toolset.client.getEntity(entityId);
    const connection = await entity.getConnection('github');

    if (!connection) {
        // If this entity/user hasn't already connected the account
        const connection = await entity.initiateConnection("github");
        console.log("Log in via: ", connection.redirectUrl);
        return connection.waitUntilActive(60);
    }

    return connection;
}



const executeGithubAgent = async (entityName) => {
 
    const body = "TITLE: HELLO WORLD, DESCRIPTION: HELLO WORLD for the repo - utkarsh-dixit/speedy"

    const entity = await toolset.client.getEntity(entityName)
    await setupUserConnectionIfNotExists(entity.id);

    const tools = await toolset.get_actions({ actions: ["github_issues_create"] }, entity.id);

    const llm = new ChatOpenAI({
        model: "gpt-4",
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
        input: "Please create another github issue with the summary and description with the following details of another issue:- , " + JSON.stringify(body)
    });

    return result.output;
}

executeGithubAgent("default");
