
import dotenv from 'dotenv';
dotenv.config();

import { ExecEnv, LangchainToolSet } from 'composio-core';
import { ChatAnthropic } from '@langchain/anthropic';
import { BACKSTORY, DESCRIPTION, GOAL } from '../prompts';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';
import { pull } from 'langchain/hub';
import { ChatPromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';

// Load environment variables from .env

// Initialize tool.
    const llm = new ChatAnthropic({
        model: "claude-3-5-sonnet-20240620",
        apiKey: process.env.ANTHROPIC_API_KEY
    });
    const composioToolset = new LangchainToolSet({ workspaceEnv: ExecEnv.DOCKER });

export async function initSWEAgent() {
    // Get required tools
    const tools = await composioToolset.getTools({
        apps: [
            "SEARCHTOOL",
            "GITCMDTOOL",
            "FILEEDITTOOL",
            "SHELLTOOL",
        ].map((a) => a.toLocaleLowerCase()),
        tags: null,
        useCase: null
    });

    // Define agent

    const chatPrompt = ChatPromptTemplate.fromTemplate(`${BACKSTORY}
    ${GOAL}
    ${DESCRIPTION}
    {agent_scratchpad}`);
    const agent = await createStructuredChatAgent({
        llm: llm,
        tools,
        prompt: chatPrompt,
    });
    const agent_executor = new AgentExecutor({ agent, tools, verbose: true});

    return {agent_executor, agent, tools, toolset: composioToolset};
}