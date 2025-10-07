/**
 * Agentic loop example with AWS Bedrock and Composio
 *
 * This example demonstrates a full agentic loop where Claude can:
 * - Make multiple tool calls
 * - Use results from one tool to inform the next
 * - Continue until the task is complete
 */

import 'dotenv/config';
import { BedrockProvider } from '@composio/bedrock';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Composio } from '@composio/core';

async function main() {
  // Initialize
  const bedrockProvider = new BedrockProvider();
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY!,
    provider: bedrockProvider
  });

  const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        }
      : {})
  });

  try {
    console.log('🚀 Starting agentic loop...\n');

    // Get tools from multiple toolkits
    const tools = await composio.tools.get('default', {
      toolkits: ['github', 'slack'],
      limit: 20
    });

    console.log(`✅ Loaded ${tools.length} tools\n`);

    // Wrap tools for Bedrock
    const bedrockTools = bedrockProvider.wrapTools(tools);

    // Initial user message
    const userMessage = 'Create a new GitHub repository called "composio-bedrock-demo" with a README, then notify our team on Slack about the new repo';

    console.log(`💬 User: ${userMessage}\n`);

    // Message history
    const messages: any[] = [
      {
        role: 'user',
        content: [{ text: userMessage }]
      }
    ];

    // Agentic loop configuration
    const MAX_ITERATIONS = 10;
    let iteration = 0;
    let continueLoop = true;

    while (continueLoop && iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`\n🔄 Iteration ${iteration}/${MAX_ITERATIONS}`);
      console.log('─'.repeat(60));

      // Send request to Claude
      const response = await bedrockClient.send(new ConverseCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        messages,
        toolConfig: { tools: bedrockTools }
      }));

      console.log(`📊 Stop reason: ${response.stopReason}`);

      if (response.stopReason === 'tool_use') {
        // Extract tool calls
        const toolCalls = response.output?.message?.content?.filter(
          (block: any) => block.toolUse
        ) || [];

        console.log(`\n🔧 Claude wants to use ${toolCalls.length} tool(s):`);
        toolCalls.forEach((call: any, idx: number) => {
          console.log(`  ${idx + 1}. ${call.toolUse.name}`);
        });

        // Execute tools
        console.log('\n⚙️  Executing tools...');
        const toolResults = await bedrockProvider.handleToolCalls(
          'default',
          response,
          { connectedAccountId: process.env.CONNECTED_ACCOUNT_ID }
        );

        console.log(`✅ Executed ${toolResults.length} tool(s)`);

        // Show tool results summary
        toolResults.forEach((result, idx) => {
          const status = result.status === 'success' ? '✓' : '✗';
          console.log(`  ${status} Tool ${idx + 1}: ${result.status}`);
        });

        // Add assistant response and tool results to message history
        messages.push({
          role: 'assistant',
          content: response.output!.message!.content!
        });

        messages.push({
          role: 'user',
          content: toolResults.map(result => ({
            toolResult: result
          }))
        });

      } else if (response.stopReason === 'end_turn') {
        // Claude has finished
        console.log('\n✨ Claude completed the task!\n');

        // Extract text response
        const textBlocks = response.output?.message?.content?.filter(
          (block: any) => block.text
        ) || [];

        if (textBlocks.length > 0) {
          console.log('📝 Final response:');
          console.log('─'.repeat(60));
          textBlocks.forEach((block: any) => {
            console.log(block.text);
          });
          console.log('─'.repeat(60));
        }

        continueLoop = false;

      } else {
        // Unexpected stop reason
        console.log(`\n⚠️  Unexpected stop reason: ${response.stopReason}`);
        continueLoop = false;
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.log('\n⚠️  Reached maximum iterations');
    }

    console.log('\n🎉 Done!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Run the example
main().catch(console.error);
