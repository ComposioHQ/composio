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
  provider: new AnthropicProvider({ cacheTools: true }),
});

async function main() {
  try {
    console.log('🔄 Fetching tools from Composio...');
    /**
     * Get the Hacker News user tool
     * This tool is automatically wrapped with the Anthropic provider format
     */
    const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
    console.log(`✅ Fetched ${tools.length} tools`);

    console.log('🔄 Creating message with Anthropic...');
    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content: "Fetch the details of the user 'pg' from Hacker News and summarize their profile",
      },
    ];
    /**
     * Create a message with Anthropic that may use tools
     */
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-latest',
      max_tokens: 1024,
      tools: tools,
      messages,
    });
    messages.push({
      role: 'assistant',
      content: message.content,
    });

    console.log('✅ Message created, processing tool calls if any...');

    /**
     * Extract tool use blocks from the message content
     */
    const toolUseBlocks = message.content.filter(content => content.type === 'tool_use');

    if (toolUseBlocks.length > 0) {
      console.log(`✅ Found ${toolUseBlocks.length} tool calls`);

      /**
       * Execute the tool calls using Composio
       */
      const toolResults = await composio.provider.handleToolCalls('default', message);
      messages.push(...toolResults);

      console.log('✅ Tool results:', messages);

      /**
       * Send a follow-up message with the tool results
       */
      const followUpMessage = await anthropic.messages.create({
        model: 'claude-3-7-sonnet-latest',
        max_tokens: 1024,
        messages,
      });

      /**
       * Extract the text response from the follow-up message
       */
      console.log('🔄 Extracting the text response from the follow-up message...');
      const finalResponse = followUpMessage.content
        .filter(content => content.type === 'text')
        .map(content => content.text)
        .join('\n');

      console.log('✅ Final response:');
      console.log(finalResponse);
    } else {
      /**
       * If no tool calls were made, just show the text response
       */
      const response = message.content
        .filter(content => content.type === 'text')
        .map(content => content.text)
        .join('\n');

      console.log('❌ Response (no tool calls):');
      console.log(response);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
