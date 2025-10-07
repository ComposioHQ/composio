/**
 * AWS Lambda example using Bedrock with Composio
 *
 * This example shows how to use the Bedrock provider in an AWS Lambda function.
 * No explicit AWS credentials are needed - Lambda's execution role provides them automatically.
 *
 * Required Lambda execution role permissions:
 * - bedrock:InvokeModel
 * - bedrock:InvokeModelWithResponseStream
 */

import { BedrockProvider } from '@composio/bedrock';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Composio } from '@composio/core';

// Initialize outside the handler for connection reuse
const bedrockProvider = new BedrockProvider();

// No credentials needed! Lambda execution role provides them automatically
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  provider: bedrockProvider
});

interface LambdaEvent {
  userId?: string;
  message: string;
  toolkits?: string[];
  connectedAccountId?: string;
}

interface LambdaResponse {
  statusCode: number;
  body: string;
}

/**
 * Lambda handler function
 */
export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  try {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const userId = event.userId || 'default';
    const message = event.message;
    const toolkits = event.toolkits || ['github'];

    // Get tools from Composio
    const tools = await composio.tools.get(userId, {
      toolkits,
      limit: 10
    });

    console.log(`Found ${tools.length} tools`);

    // Wrap tools for Bedrock
    const bedrockTools = bedrockProvider.wrapTools(tools);

    // Make request to Claude via Bedrock
    const response = await bedrockClient.send(new ConverseCommand({
      modelId: 'anthropic.claude-sonnet-4-5-20250514-v1:0',
      messages: [
        {
          role: 'user',
          content: [{ text: message }]
        }
      ],
      toolConfig: {
        tools: bedrockTools
      }
    }));

    console.log('Response stop reason:', response.stopReason);

    // Handle tool calls if needed
    if (response.stopReason === 'tool_use') {
      console.log('Executing tools...');

      const toolResults = await bedrockProvider.handleToolCalls(
        userId,
        response,
        { connectedAccountId: event.connectedAccountId }
      );

      console.log(`Executed ${toolResults.length} tool(s)`);

      // Get final response with tool results
      const followUpResponse = await bedrockClient.send(new ConverseCommand({
        modelId: 'anthropic.claude-sonnet-4-5-20250514-v1:0',
        messages: [
          {
            role: 'user',
            content: [{ text: message }]
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

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: followUpResponse.output?.message?.content,
          toolsUsed: toolResults.length
        })
      };
    }

    // Return response without tool execution
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: response.output?.message?.content,
        toolsUsed: 0
      })
    };

  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * For local testing, you can invoke the handler directly:
 *
 * @example
 * ```typescript
 * import { handler } from './lambda';
 *
 * handler({
 *   message: 'List my GitHub repositories',
 *   toolkits: ['github']
 * }).then(console.log).catch(console.error);
 * ```
 *
 * Or use AWS SAM CLI for local Lambda testing:
 * ```bash
 * sam local invoke -e event.json
 * ```
 */
