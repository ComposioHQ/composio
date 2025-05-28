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
import { stdout } from 'process';

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
  console.log('🔄 Fetching tools from Composio...');
  const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
  console.log(`✅ Fetched ${tools.length} tools`);

  console.log('🔄 Creating message with Anthropic...');
  const stream = await anthropic.messages
    .stream({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: 'Tell me about the user "pg" from Hacker News',
        },
      ],
      tools: tools,
    })
    .on('text', text => {
      stdout.write(text);
    })
    .on('end', () => {
      stdout.write('\n');
    });

  const message = await stream.finalMessage();

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

    console.log('✅ Tool results:', toolResults);

    /**
     * Send a follow-up message with the tool results
     */
    const followUpStream = await anthropic.messages
      .stream({
        model: 'claude-3-7-sonnet-latest',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content:
              "Fetch the details of the user 'pg' from Hacker News and summarize their profile",
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
      })
      .on('text', text => {
        stdout.write(text);
      })
      .on('end', () => {
        stdout.write('\n');
      });

    const followUpMessage = await followUpStream.finalMessage();

    console.log(followUpMessage);
  }
}

main();
