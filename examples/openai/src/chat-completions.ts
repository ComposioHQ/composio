/**
 * OpenAI Chat Completions with Composio Tool Example
 *
 * This example demonstrates how to use the Composio OpenAIToolset with OpenAI chat completions API.
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
 * Main function to demonstrate OpenAI Chat Completions with Composio tool
 */
async function main() {
  try {
    console.log('🔄 Setting up Composio and fetching tool...');

    const tool = await composio.tools.get('default', 'HACKERNEWS_GET_USER');

    const query = "Find information about the HackerNews user 'pg'";

    console.log(`🔄 Sending query to OpenAI: "${query}"`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that can use tools to answer questions.',
        },
        { role: 'user', content: query },
      ],
      tools: [tool],
      tool_choice: 'auto',
    });

    if (response.choices[0].message.tool_calls) {
      console.log(
        '🔧 Assistant is using tool:',
        response.choices[0].message.tool_calls[0].function.name
      );

      const toolResult = await composio.toolset.executeToolCall(
        'default',
        response.choices[0].message.tool_calls[0],
        {
          connectedAccountId: '', // Optional connected account ID
        }
      );

      console.log('✅ Tool execution result:', JSON.parse(toolResult));

      const finalResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that can use tools to answer questions.',
          },
          { role: 'user', content: query },
          response.choices[0].message,
          {
            role: 'tool',
            tool_call_id: response.choices[0].message.tool_calls[0].id,
            content: toolResult,
          },
        ],
      });

      console.log('🤖 Final assistant response:', finalResponse.choices[0].message.content);
    } else {
      console.log('🤖 Assistant response:', response.choices[0].message.content);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
