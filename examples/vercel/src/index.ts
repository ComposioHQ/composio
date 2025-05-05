import { Composio } from "@composio/core";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { VercelToolset } from "@composio/vercel";

const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    toolset: new VercelToolset()
});

const hackerNewsTool = await composio.toolset.getToolBySlug("HACKERNEWS_GET_FRONTPAGE");

const MessageRoles = {
    USER: "user",
    ASSISTANT: "assistant",
    TOOL: "tool"
} as const;

type MessageRole = typeof MessageRoles[keyof typeof MessageRoles];
type Message = { role: MessageRole; content: string | any };

const messages: Message[] = [{
    role: MessageRoles.USER,
    content: "Summarize the front page of HackerNews"
}];

const chatCompletion = async () => {

    const { text, toolCalls, toolResults } = await generateText({
        model: openai("gpt-4o-mini"),
        tools: { ["HACKERNEWS_GET_FRONTPAGE"]: hackerNewsTool },
        messages,
    });

    if (toolResults.length > 0 && toolCalls.length > 0) {
        toolCalls.forEach(async (toolCall) => {
            console.log(`Executing tool call: ${toolCall.toolName}`);
        });
        
        messages.push({
            role: MessageRoles.ASSISTANT,
            content: toolCalls,
        })

        messages.push({
            role: MessageRoles.TOOL,
            content: toolResults,
        })


        await chatCompletion();
    } else {
        messages.push({ role: MessageRoles.ASSISTANT, content: text })
        console.log(`Assistant: ${text}\n`)
    }
}

chatCompletion();