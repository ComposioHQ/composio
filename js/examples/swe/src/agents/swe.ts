
import dotenv from 'dotenv';
dotenv.config();

import { ExecEnv, OpenAIToolSet } from 'composio-core';
import { ChatAnthropic } from '@langchain/anthropic';
import { BACKSTORY, DESCRIPTION, GOAL } from '../prompts';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';
import OpenAI from 'openai';

// Initialize tool.
const llm = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const composioToolset = new OpenAIToolSet({ workspaceEnv: ExecEnv.DOCKER });

export async function initSWEAgent() {
    let tools = await composioToolset.get_tools({
        apps: [
            "filetool",
            "fileedittool",
            "shelltool"
        ],
        tags: null,
        useCase: null
    });

    tools = tools.map((a) => {
        if (a.function?.description?.length || 0 > 1024) {
            a.function.description = a.function.description?.substring(0, 1024);
        }
        return a;
    });

    tools = tools.map((tool) => {
        const updateNullToEmptyArray = (obj) => {
            for (const key in obj) {
                if (obj[key] === null) {
                    obj[key] = [];
                } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    updateNullToEmptyArray(obj[key]);
                }
            }
        };

        updateNullToEmptyArray(tool);
        return tool;
    });

    console.log("tools", JSON.stringify(tools.find((a) => a.function.name == "filetool_git_patch")!.function.parameters, null, 2));


    const assistantThread = await llm.beta.threads.create({
        messages: [
            {
                role: "assistant",
                content:`${BACKSTORY}\n\n${GOAL}\n\n${DESCRIPTION}`
            }
        ]
    });


    return { assistantThread, llm, tools, composioToolset };
    
    // const chatPrompt = ChatPromptTemplate.fromTemplate(`
    //     You are a Software Engineer. Your goal is to fix the coding issues given by the user.
    //     ${BACKSTORY}
    //     ${GOAL}
    //     ${DESCRIPTION}
    //     Agent's Scratchpad: {agent_scratchpad}
    // `);
    // const agent = await createStructuredChatAgent({
    //     llm: llm,
    //     tools,
    //     prompt: chatPrompt,
    // });
    // const agent_executor = new AgentExecutor({ agent, tools, verbose: true, maxIterations: 30});

    // return {agent_executor, agent, tools, toolset: composioToolset};
}
