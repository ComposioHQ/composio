/**
 * Example for using Anthropic provider with Composio SDK
 * 
 * Required environment variables:
 * - COMPOSIO_API_KEY: Your Composio API key (get one at https://app.composio.dev)
 * - ANTHROPIC_API_KEY: Your Anthropic API key (get one at https://console.anthropic.com)
 */
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Initialize Composio with the Anthropic provider
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

async function main() {
  try {
    console.log('Fetching tools from Composio...');
    /**
     * Get the Hacker News user tool
     * This tool is automatically wrapped with the Anthropic provider format
     */
    const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
    console.log(`Fetched ${tools.length} tools`);

    console.log('Creating message with Anthropic...');
    /**
     * Create a message with Anthropic that may use tools
     */
    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      tools,
      messages: [
        {
          role: 'user',
          content: "Fetch the details of the user 'pg' from Hacker News and summarize their profile",
        },
      ],
    });

    console.log('Message created, processing tool calls if any...');
    
    /**
     * Extract tool use blocks from the message content
     */
    const toolUseBlocks = message.content.filter(
      (content) => content.type === 'tool_use'
    );

    if (toolUseBlocks.length > 0) {
      console.log(`Found ${toolUseBlocks.length} tool calls`);
      
      /**
       * Execute the tool calls using Composio
       */
      const toolResults = await composio.provider.handleToolCalls(
        'default',
        message
      );
      
      console.log('Tool results:', toolResults);
      
      /**
       * Send a follow-up message with the tool results
       */
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
      
      /**
       * Extract the text response from the follow-up message
       */
      const finalResponse = followUpMessage.content
        .filter((content) => content.type === 'text')
        .map((content) => content.text)
        .join('\n');
      
      console.log('Final response:');
      console.log(finalResponse);
    } else {
      /**
       * If no tool calls were made, just show the text response
       */
      const response = message.content
        .filter((content) => content.type === 'text')
        .map((content) => content.text)
        .join('\n');
      
      console.log('Response (no tool calls):');
      console.log(response);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
