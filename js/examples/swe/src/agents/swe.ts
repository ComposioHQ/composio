
import dotenv from 'dotenv';
dotenv.config();

import { ExecEnv, OpenAIToolSet } from 'composio-core';
import { BACKSTORY, DESCRIPTION, GOAL } from '../prompts';
import OpenAI from 'openai';

// Initialize tool.
const llm = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const composioToolset = new OpenAIToolSet({ workspaceEnv: ExecEnv.DOCKER });

export async function initSWEAgent() {
    let tools = await composioToolset.getTools({
        apps: [
            "filetool",
            "fileedittool",
            "shelltool"
        ],
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

    const assistantThread = await llm.beta.threads.create({
        messages: [
            {
                role: "assistant",
                content:`${BACKSTORY}\n\n${GOAL}\n\n${DESCRIPTION}`
            }
        ]
    });


    return { assistantThread, llm, tools, composioToolset };
}
