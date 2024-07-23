
import dotenv from 'dotenv';
dotenv.config();

import { ExecEnv, LangchainToolSet } from 'composio-core';
import { ChatAnthropic } from '@langchain/anthropic';
import { BACKSTORY, DESCRIPTION, GOAL } from '../prompts';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Initialize tool.
const llm = new ChatAnthropic({
    model: "claude-3-5-sonnet-20240620",
    apiKey: process.env.ANTHROPIC_API_KEY
});
const composioToolset = new LangchainToolSet({ workspaceEnv: ExecEnv.DOCKER });

export async function initSWEAgent() {
    const tools = await composioToolset.getTools({
        apps: [
            "filetool",
            "shelltool"
        ],
        tags: null,
        useCase: null
    });


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
