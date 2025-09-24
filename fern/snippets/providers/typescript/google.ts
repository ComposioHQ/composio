import {Composio} from '@composio/core';
import {GoogleProvider} from '@composio/google'
import {GoogleGenAI} from '@google/genai'

const composio = new Composio({
    apiKey: "your-composio-api-key",
    provider: new GoogleProvider()
})

const ai = new GoogleGenAI({
    apiKey: "your-gemini-api-key"
})

// Use a unique identifier for each user in your application
const user_id = "your-external-user-id"

// Get tools - this returns already wrapped tools when using GoogleProvider
const tools = await composio.tools.get(user_id, 'HACKERNEWS_GET_USER')

const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-001',
    contents: "Search for the user 'pg's",
    config: {
        tools: [{ functionDeclarations: tools }],
    },
});

if (response.functionCalls && response.functionCalls.length > 0) {
    console.log(`Calling tool ${response.functionCalls[0].name}`);
    const functionCall = {
        name: response.functionCalls[0].name || '',
        args: response.functionCalls[0].args || {},
    };
    const result = await composio.provider.executeToolCall(user_id, functionCall);
    console.log(`Result: ${result}`);
} else {
    console.log('No function calls in the response');
    console.log(response.text);
}