# @composio/bedrock

AWS Bedrock provider for Composio SDK with support for Anthropic Claude models.

## Features

- ✅ Full support for AWS Bedrock Converse API
- ✅ Seamless integration with Anthropic Claude models
- ✅ Tool wrapping and execution
- ✅ Error handling and retry logic
- ✅ TypeScript support with full type definitions
- ✅ Comprehensive logging

## Installation

```bash
npm install @composio/bedrock @aws-sdk/client-bedrock-runtime @composio/core
# or
yarn add @composio/bedrock @aws-sdk/client-bedrock-runtime @composio/core
# or
pnpm add @composio/bedrock @aws-sdk/client-bedrock-runtime @composio/core
```

## Quick Start

```typescript
import { BedrockProvider } from '@composio/bedrock';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Composio } from '@composio/core';

// Initialize the Bedrock provider
const bedrockProvider = new BedrockProvider();

// Initialize Composio with your API key
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  provider: bedrockProvider,
});

// Initialize AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
```

## Usage Examples

### Using Tools with Claude via Bedrock

```typescript
// Get tools from Composio (e.g., GitHub toolkit)
const tools = await composio.tools.get('user-id', {
  toolkits: ['github'],
});

// Wrap tools in Bedrock format
const bedrockTools = bedrockProvider.wrapTools(tools);

// Make a request to Claude via Bedrock
const response = await bedrockClient.send(
  new ConverseCommand({
    modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    messages: [
      {
        role: 'user',
        content: [{ text: 'Create a GitHub repository called "my-new-repo"' }],
      },
    ],
    toolConfig: {
      tools: bedrockTools,
    },
  })
);

// Handle tool calls if the model requests them
if (response.stopReason === 'tool_use') {
  const toolResults = await bedrockProvider.handleToolCalls('user-id', response, {
    connectedAccountId: 'your-connected-account-id',
  });

  // Continue the conversation with tool results
  const followUpResponse = await bedrockClient.send(
    new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: [
        {
          role: 'user',
          content: [{ text: 'Create a GitHub repository called "my-new-repo"' }],
        },
        {
          role: 'assistant',
          content: response.output.message.content,
        },
        {
          role: 'user',
          content: toolResults.map(result => ({
            toolResult: result,
          })),
        },
      ],
      toolConfig: {
        tools: bedrockTools,
      },
    })
  );

  console.log(followUpResponse.output.message.content);
}
```

### Complete Example with Agentic Loop

```typescript
import { BedrockProvider } from '@composio/bedrock';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Composio } from '@composio/core';

async function main() {
  // Initialize
  const bedrockProvider = new BedrockProvider();
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY!,
    provider: bedrockProvider,
  });

  const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  try {
    // Get and wrap tools
    const tools = await composio.tools.get('user-id', {
      toolkits: ['github', 'slack'],
    });
    const bedrockTools = bedrockProvider.wrapTools(tools);

    // Initial request
    let messages = [
      {
        role: 'user' as const,
        content: [{ text: 'Create a GitHub repo and notify the team on Slack' }],
      },
    ];

    let continueLoop = true;
    let maxIterations = 5;
    let iteration = 0;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      const response = await bedrockClient.send(
        new ConverseCommand({
          modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          messages,
          toolConfig: { tools: bedrockTools },
        })
      );

      if (response.stopReason === 'tool_use') {
        // Execute tools
        const toolResults = await bedrockProvider.handleToolCalls('user-id', response, {
          connectedAccountId: process.env.CONNECTED_ACCOUNT_ID,
        });

        // Add assistant message and tool results to conversation
        messages.push({
          role: 'assistant',
          content: response.output.message.content,
        });

        messages.push({
          role: 'user',
          content: toolResults.map(result => ({
            toolResult: result,
          })),
        });
      } else {
        // Model finished
        console.log('Final response:', response.output.message.content);
        continueLoop = false;
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

## Supported Claude Models

This provider supports all Anthropic Claude models available on AWS Bedrock, including:

- `anthropic.claude-3-5-sonnet-20241022-v2:0` (Claude 3.5 Sonnet v2) - **Recommended**
- `anthropic.claude-3-5-sonnet-20240620-v1:0` (Claude 3.5 Sonnet v1)
- `anthropic.claude-3-opus-20240229-v1:0` (Claude 3 Opus)
- `anthropic.claude-3-sonnet-20240229-v1:0` (Claude 3 Sonnet)
- `anthropic.claude-3-haiku-20240307-v1:0` (Claude 3 Haiku)

### Using Inference Profiles

For production workloads, use [inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html) for better performance:

```typescript
const response = await bedrockClient.send(
  new ConverseCommand({
    modelId: 'us.anthropic.claude-3-5-sonnet-v2:0', // Inference profile ID
    // ... rest of configuration
  })
);
```

**Benefits of Inference Profiles:**

- 🌍 **Cross-region routing**: Automatic routing to the best available region
- ⚡ **Higher throughput**: Improved performance for production workloads
- 🛡️ **Better availability**: Automatic failover across regions

## API Reference

### `BedrockProvider`

The main provider class for AWS Bedrock integration.

#### Methods

##### `wrapTool(tool: Tool): BedrockTool`

Wraps a single Composio tool in AWS Bedrock format.

##### `wrapTools(tools: Tool[]): BedrockToolCollection`

Wraps multiple Composio tools in AWS Bedrock format.

##### `executeToolCall(userId, toolUse, options?, modifiers?)`

Executes a single tool call from Bedrock's response.

##### `handleToolCalls(userId, converseOutput, options?, modifiers?)`

Handles all tool calls from a Bedrock Converse API response.

## Environment Variables

```bash
# Required
COMPOSIO_API_KEY=your-composio-api-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# Optional
AWS_REGION=us-east-1
CONNECTED_ACCOUNT_ID=your-connected-account-id
```

## IAM Permissions

### Basic Permissions (Foundation Models)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": ["arn:aws:bedrock:*::foundation-model/anthropic.claude-*"]
    }
  ]
}
```

### With Inference Profiles (Recommended for Production)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:GetInferenceProfile",
        "bedrock:ListInferenceProfiles"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
        "arn:aws:bedrock:*:*:inference-profile/*"
      ]
    }
  ]
}
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
