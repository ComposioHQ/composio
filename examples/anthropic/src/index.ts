/**
 * Example for using Anthropic provider with Composio SDK
 */
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

if (!process.env.COMPOSIO_API_KEY) {
  console.error('Missing COMPOSIO_API_KEY environment variable');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY environment variable');
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

async function main() {
  try {
    console.log('Fetching tools from Composio...');
    const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
    console.log(`Fetched ${tools.length} tools`);

    console.log('Creating message with Anthropic...');
    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      tools: tools,
      messages: [
        {
          role: 'user',
          content: "Fetch the details of the user 'pg' from Hacker News and summarize their profile",
        },
      ],
    });

    console.log('Message created, processing tool calls if any...');
    
    const toolUseBlocks = message.content.filter(
      (content: any) => content.type === 'tool_use'
    );

    if (toolUseBlocks.length > 0) {
      console.log(`Found ${toolUseBlocks.length} tool calls`);
      
      const toolResults = await composio.provider.handleToolCalls(
        'default',
        message
      );
      
      console.log('Tool results:', toolResults);
      
      const followUpMessage = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: "Fetch the details of the user 'pg' from Hacker News and summarize their profile",
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: "I'll fetch the details for the Hacker News user 'pg'.",
              },
              ...toolUseBlocks,
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseBlocks[0].id,
                content: toolResults[0],
              },
            ],
          },
        ],
      });
      
      const finalResponse = followUpMessage.content
        .filter((content: any) => content.type === 'text')
        .map((content: any) => content.text)
        .join('\n');
      
      console.log('Final response:');
      console.log(finalResponse);
    } else {
      const response = message.content
        .filter((content: any) => content.type === 'text')
        .map((content: any) => content.text)
        .join('\n');
      
      console.log('Response (no tool calls):');
      console.log(response);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
