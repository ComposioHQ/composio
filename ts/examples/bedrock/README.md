# AWS Bedrock with Composio Examples

This directory contains examples demonstrating how to use the Composio SDK with AWS Bedrock and Anthropic Claude models.

## Prerequisites

1. **Composio API Key**: Sign up at [composio.dev](https://composio.dev)
2. **AWS Account** with Bedrock access
3. **IAM Permissions**: Your AWS credentials need permissions for `bedrock:InvokeModel`

## Setup

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in your credentials in `.env`:
   ```bash
   COMPOSIO_API_KEY=your_composio_api_key
   AWS_ACCESS_KEY_ID=your_aws_access_key_id      # Optional for local dev
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key      # Optional for local dev
   AWS_REGION=us-east-1
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

## Examples

### 1. Basic Usage (`src/index.ts`)

Simple example showing how to:
- Initialize Bedrock provider
- Fetch and wrap tools
- Make requests to Claude via Bedrock
- Handle tool calls

**Run:**
```bash
pnpm start
```

### 2. AWS Lambda (`src/lambda.ts`)

Example Lambda function that:
- Uses IAM role for credentials (no explicit credentials needed)
- Processes user requests
- Executes Composio tools
- Returns results

**For local testing:**
```bash
pnpm lambda
```

**Lambda IAM Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
    }
  ]
}
```

### 3. Agentic Loop (`src/agentic-loop.ts`)

Advanced example demonstrating:
- Multi-step task completion
- Multiple tool executions
- Iterative problem solving
- Complex workflows (e.g., create repo + notify team)

**Run:**
```bash
pnpm tsx src/agentic-loop.ts
```

## Authentication Modes

### Local Development
Provide AWS credentials via environment variables or AWS config:
```typescript
const bedrockClient = new BedrockRuntimeClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});
```

### AWS Lambda/ECS/EC2
No credentials needed - use IAM roles:
```typescript
const bedrockClient = new BedrockRuntimeClient({
  region: 'us-east-1'
  // Credentials automatically provided by IAM role
});
```

## Supported Models

All Anthropic Claude models on AWS Bedrock:
- `anthropic.claude-3-5-sonnet-20241022-v2:0` (Claude 3.5 Sonnet v2) - **Recommended**
- `anthropic.claude-3-5-sonnet-20240620-v1:0` (Claude 3.5 Sonnet v1)
- `anthropic.claude-3-opus-20240229-v1:0` (Claude 3 Opus)
- `anthropic.claude-3-sonnet-20240229-v1:0` (Claude 3 Sonnet)
- `anthropic.claude-3-haiku-20240307-v1:0` (Claude 3 Haiku)

## Available Toolkits

Composio provides 200+ tools across various platforms:
- **GitHub**: Repository management, issues, PRs, actions
- **Slack**: Messaging, channels, users
- **Gmail**: Email sending, reading, searching
- **Calendar**: Event management
- **Jira**: Issue tracking
- And many more...

See the full list at [docs.composio.dev](https://docs.composio.dev)

## Troubleshooting

### AWS Credentials Not Found
Make sure you have:
1. Set environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. Or configured AWS CLI (`aws configure`)
3. Or running in AWS environment with IAM role

### Bedrock Access Denied
Ensure your AWS account has:
1. Bedrock model access enabled in AWS Console
2. Proper IAM permissions for `bedrock:InvokeModel`

### Tool Execution Fails
Check that you have:
1. Connected the relevant account in Composio dashboard
2. Provided `connectedAccountId` in tool execution options
3. Proper permissions for the connected account

## Learn More

- [Composio Documentation](https://docs.composio.dev)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Anthropic Claude on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html)
