import OpenAI from 'openai';
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';

// Initialize Composio client with OpenAI Provider
const composio = new Composio({ 
    provider: new OpenAIResponsesProvider(), 
});
const openai = new OpenAI({});

// Make sure to create an auth config and a connected account for the user with gmail toolkit
// Make sure to replace "your-user-id" with the actual user ID
const userId = "your-user-id";

async function main() {
    try {
        const tools = await composio.tools.get(userId, {tools: ["GMAIL_SEND_EMAIL"]});

        const response = await openai.responses.create({
            model: "gpt-5",
            tools: tools,
            input: [
                {
                    role: "user", 
                    content: "Send an email to soham.g@composio.dev with the subject 'Running OpenAI Provider snippet' and body 'Hello from the code snippet in openai docs'"
                },
            ],
        });

        // Execute the function calls
        const result = await composio.provider.handleToolCalls(userId, response.output);
        console.log(result);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
