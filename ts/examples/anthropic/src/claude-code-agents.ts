/**
 * Example for using Claude Code Agents provider with Composio SDK
 *
 * This example demonstrates how to use Composio tools with the Claude Agent SDK
 * to create an AI agent that can interact with external services like Gmail.
 *
 * Required environment variables:
 * - COMPOSIO_API_KEY: Your Composio API key (get one at https://app.composio.dev)
 * - ANTHROPIC_API_KEY: Your Anthropic API key (get one at https://console.anthropic.com)
 *
 * Prerequisites:
 * - Claude Code CLI must be installed: npm install -g @anthropic-ai/claude-code
 *
 * Usage:
 *   bun src/claude-code-agents.ts
 */
import { Composio } from '@composio/core';
import { ClaudeCodeAgentsProvider } from '@composio/claude-code-agents';
import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import 'dotenv/config';

/**
 * Initialize Composio with the Claude Code Agents provider
 */
const provider = new ClaudeCodeAgentsProvider();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider,
});

async function main() {
  console.log('🔄 Fetching Gmail tools from Composio...');

  /**
   * Get the Gmail fetch emails tool
   * This tool allows the agent to retrieve emails from Gmail
   * The tools are already wrapped by composio.tools.get() into Claude Agent SDK format
   */
  const tools = await composio.tools.get('default', 'GMAIL_FETCH_EMAILS');
  console.log(`✅ Fetched ${tools.length} tool(s)`);

  /**
   * Create an MCP server configuration with the Composio tools
   * Using createSdkMcpServer directly from the Claude Agent SDK
   */
  console.log('🔄 Creating MCP server with Composio tools...');
  const mcpServer = createSdkMcpServer({
    name: 'composio',
    version: '1.0.0',
    tools,
  });
  console.log('✅ MCP server created');

  /**
   * Run the Claude agent with access to Composio tools
   * The agent will use the Gmail tool to fetch and summarize emails
   */
  console.log('🔄 Running Claude agent...');
  console.log('─'.repeat(50));

  let finalResponse = '';

  for await (const message of query({
    prompt: 'Fetch my latest email from Gmail and provide a brief summary of it, including the sender, subject, and a one-sentence summary of the content.',
    options: {
      mcpServers: { composio: mcpServer },
      // Allow the agent to use MCP tools without manual permission prompts
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      // Limit the number of turns to prevent infinite loops
      maxTurns: 10,
    },
  })) {
    // Handle different message types from the agent
    if (message.type === 'assistant') {
      // Assistant's text response
      if (typeof message.message === 'string') {
        finalResponse = message.message;
      } else if (message.message?.content) {
        // Handle structured content
        const textContent = message.message.content
          .filter((block: { type: string }) => block.type === 'text')
          .map((block: { type: string; text?: string }) => block.text)
          .join('\n');
        if (textContent) {
          finalResponse = textContent;
        }
      }
    } else if (message.type === 'result') {
      // Tool execution result
      console.log(`📧 Tool executed: ${message.subtype || 'unknown'}`);
    }
  }

  console.log('─'.repeat(50));
  console.log('✅ Agent completed');
  console.log('\n📋 Final Response:');
  console.log(finalResponse || 'No response generated');

}

main();
