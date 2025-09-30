import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import { OpenAI } from 'openai';

// Initialize Composio with OpenAI Responses Provider
const composio = new Composio({
    provider: new OpenAIResponsesProvider()
});

const openai = new OpenAI();
const userId = 'user-dev-178';

// Fetch tools for the assistant
const tools = await composio.tools.get(userId, {
    toolkits: ['GITHUB', 'SLACK']
});

// Create an OpenAI assistant with Composio tools
const assistant = await openai.beta.assistants.create({
    name: 'Developer Assistant',
    instructions: 'You are a helpful assistant that can interact with GitHub and Slack.',
    model: 'gpt-4-turbo',
    tools: tools  // Composio tools are directly compatible
});

// Create a thread
const thread = await openai.beta.threads.create();

// Add a message to the thread
await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Create a GitHub issue about the new feature we discussed'
});

// Run the assistant
const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id
});

// Handle tool calls and wait for completion
const completedRun = await composio.provider.waitAndHandleAssistantToolCalls(
    userId,
    openai,
    run,
    thread
);

// Get the assistant's response
const messages = await openai.beta.threads.messages.list(thread.id);
console.log(messages.data[0].content[0].text.value);