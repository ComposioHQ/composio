/**
 * Basic example of using AWS Bedrock with Composio
 *
 * This example demonstrates:
 * - Setting up Bedrock provider
 * - Getting and wrapping tools
 * - Making a simple request to Claude via Bedrock
 * - Handling tool calls
 */

import 'dotenv/config';
import { BedrockProvider } from '@composio/bedrock';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Composio } from '@composio/core';

async function main() {
  // Initialize Bedrock provider
  const bedrockProvider = new BedrockProvider();

  // Initialize Composio
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY!,
    provider: bedrockProvider
  });

  // Initialize AWS Bedrock client
  // For local development, credentials come from env vars or AWS config
  // In Lambda/ECS/EC2, credentials come from IAM roles automatically
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
    console.log('🚀 Fetching tools from Composio...');

    // Get tools - you can specify toolkits, apps, or specific tools
    const tools = await composio.tools.get('default', {
      toolkits: ['github'],
      limit: 5
    });

    console.log(`✅ Found ${tools.length} tools`);

    // Wrap tools in Bedrock format
    const bedrockTools = bedrockProvider.wrapTools(tools);

    console.log('💬 Sending request to Claude via Bedrock...');

    // Make a request to Claude via Bedrock
    const response = await bedrockClient.send(new ConverseCommand({
      modelId: 'anthropic.claude-sonnet-4-5-20250514-v1:0',
      messages: [
        {
          role: 'user',
          content: [{ text: 'List my GitHub repositories' }]
        }
      ],
      toolConfig: {
        tools: bedrockTools
      }
    }));

    console.log('📝 Response received!');
    console.log('Stop reason:', response.stopReason);

    // Handle tool calls if Claude wants to use tools
    if (response.stopReason === 'tool_use') {
      console.log('🔧 Claude wants to use tools, executing...');

      const toolResults = await bedrockProvider.handleToolCalls(
        'default',
        response,
        { connectedAccountId: process.env.CONNECTED_ACCOUNT_ID }
      );

      console.log(`✅ Executed ${toolResults.length} tool(s)`);
      console.log('Tool results:', JSON.stringify(toolResults, null, 2));

      // Continue the conversation with tool results
      console.log('💬 Sending tool results back to Claude...');

      const followUpResponse = await bedrockClient.send(new ConverseCommand({
        modelId: 'anthropic.claude-sonnet-4-5-20250514-v1:0',
        messages: [
          {
            role: 'user',
            content: [{ text: 'List my GitHub repositories' }]
          },
          {
            role: 'assistant',
            content: response.output!.message!.content!
          },
          {
            role: 'user',
            content: toolResults.map(result => ({
              toolResult: result
            }))
          }
        ],
        toolConfig: {
          tools: bedrockTools
        }
      }));

      console.log('\n📊 Final Response:');
      console.log(JSON.stringify(followUpResponse.output?.message?.content, null, 2));
    } else {
      console.log('\n📊 Response (no tools used):');
      console.log(JSON.stringify(response.output?.message?.content, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the example
main().catch(console.error);
