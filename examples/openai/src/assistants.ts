/**
 * OpenAI Assistants with Composio Tool Example
 *
 * This example demonstrates how to use the Composio OpenAIToolset with OpenAI Assistants API.
 * It uses the HACKERNEWS_GET_USER tool to fetch information about a HackerNews user.
 */
import { Composio } from '@composio/core';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Main function to demonstrate OpenAI Assistants with Composio tool
 */
async function main() {
  try {
    console.log('🔄 Setting up Composio and fetching tool...');

    const tool = await composio.getToolBySlug('default', 'HACKERNEWS_GET_USER');

    console.log('🔄 Creating OpenAI Assistant with Composio tool...');

    const assistant = await openai.beta.assistants.create({
      name: 'HackerNews Helper',
      instructions:
        'You are a helpful assistant that can fetch information about HackerNews users.',
      model: 'gpt-4o',
      tools: [tool],
    });

    console.log(`✅ Assistant created with ID: ${assistant.id}`);

    const thread = await openai.beta.threads.create();
    console.log(`✅ Thread created with ID: ${thread.id}`);

    const query = "Get information about the HackerNews user 'pg'";
    console.log(`🔄 Adding message to thread: "${query}"`);

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: query,
    });

    console.log('🔄 Running the assistant...');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    console.log('🔄 Waiting for assistant response and handling tool calls...');
    const completedRun = await composio.toolset.waitAndHandleAssistantToolCalls(
      'default',
      openai,
      run,
      thread
    );

    console.log(`✅ Run completed with status: ${completedRun.status}`);

    const messages = await openai.beta.threads.messages.list(thread.id);

    console.log('🤖 Assistant responses:');
    for (const message of messages.data) {
      if (message.role === 'assistant') {
        for (const content of message.content) {
          if (content.type === 'text') {
            console.log(`- ${content.text.value}`);
          }
        }
      }
    }

    await openai.beta.assistants.del(assistant.id);
    console.log('🧹 Cleaned up: Assistant deleted');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
