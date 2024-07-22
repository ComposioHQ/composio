
import dotenv from 'dotenv';
dotenv.config();

import { ExecEnv, LangchainToolSet } from 'composio-core';
import { ChatOpenAI } from '@langchain/openai';
import { BACKSTORY, DESCRIPTION, EXPECTED_OUTPUT, GOAL, ROLE } from '../prompts';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { pull } from 'langchain/hub';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Load environment variables from .env

// Initialize tool.
const openaiClient = new ChatOpenAI({ modelName: "gpt-4o", apiKey: process.env.OPEN_AI_API_KEY });
const composioToolset = new LangchainToolSet({ workspaceEnv: ExecEnv.DOCKER });

export async function initSWEAgent() {
    // Get required tools
    const tools = await composioToolset.getTools({
        apps: [
            "SEARCHTOOL",
            "GITCMDTOOL",
            "FILEEDITTOOL",
            "HISTORYFETCHERTOOL",
            "SHELLEXEC",
        ].map((a) => a.toLocaleLowerCase()),
        tags: null,
        useCase: null
    });

    // Define agent

    const agent = await createOpenAIToolsAgent({
         // @ts-ignore
        llm: openaiClient,
        tools,
        prompt: ChatPromptTemplate.fromTemplate(`System: You are an AI assistant helping a software engineer solve coding issues. You have access to various tools like code search, file editing, shell execution, etc. Use these tools judiciously to understand and fix the issue.

${BACKSTORY}

Goal: ${GOAL}
Description: ${DESCRIPTION}
Expected output: ${EXPECTED_OUTPUT}

Agent Scratchpad: {agent_scratchpad}`)
    });
    const agent_executor = new AgentExecutor({ agent, tools, verbose: true});

    return {agent_executor, agent, tools, toolset: composioToolset};
}