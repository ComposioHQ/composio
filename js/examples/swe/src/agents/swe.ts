
import dotenv from 'dotenv';
dotenv.config();

import { ExecEnv, OpenAIToolSet, Workspace } from 'composio-core';
import { BACKSTORY, DESCRIPTION, GOAL } from '../prompts';
import OpenAI from 'openai';
import { v4 } from 'uuid';

// Initialize tool.
const llm = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://oai.helicone.ai/v1",
    defaultHeaders: {
        "Helicone-Auth": `Bearer sk-helicone-qyrd4dq-vruuq3q-xfv7x7a-i75osli`,
        "Helicone-Session-Id": "swe-" + v4(),
    },
});
const composioToolset = new OpenAIToolSet({ workspaceConfig: Workspace.Docker() });

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
