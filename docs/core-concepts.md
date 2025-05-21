# Core Concepts

Composio SDK is built around a set of key concepts that work together to provide a seamless integration experience for third-party services and tools.

## Tools

Tools are the fundamental units of functionality in Composio. Each tool represents a specific action that can be performed, such as "Get GitHub Repository" or "Send Email". Tools have:

- **Slug**: A unique identifier (e.g., `GITHUB_GET_REPO`)
- **Name**: A human-readable name (e.g., "Get GitHub Repository")
- **Description**: A description of what the tool does
- **Input Parameters**: The arguments required to execute the tool
- **Output Parameters**: The data returned by the tool

Tools are organized into toolkits and can be executed through the Composio SDK.

```typescript
// Example: Execute a GitHub tool
const result = await composio.tools.execute('GITHUB_GET_REPO', {
  userId: 'default',
  arguments: {
    owner: 'composio',
    repo: 'sdk',
  },
});
```

## Toolkits

Toolkits are collections of related tools grouped by service or functionality. For example, the "GitHub" toolkit includes tools for interacting with repositories, issues, pull requests, and more.

Toolkits typically require authentication to be accessed, which is managed through connected accounts.

```typescript
// Example: Get all tools from the GitHub toolkit
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});
```

## Connected Accounts

Connected Accounts represent a user's connection to an external service (toolkit). They store authentication tokens and other information needed to access the service.

The SDK provides methods to create, manage, and use connected accounts:

```typescript
// Example: Initiate a connection to GitHub
const connectionRequest = await composio.toolkits.authorize('user123', 'github');

// Example: Wait for the connection to be established
const connectedAccount = await composio.connectedAccounts.waitForConnection(connectionRequest.id);
```

## Auth Configs

Auth Configs define how authentication works for a particular toolkit. They specify the auth scheme (OAuth2, API Key, etc.) and other authentication-related details.

Auth Configs are usually created automatically when authorizing a toolkit but can also be created manually.

```typescript
// Example: Create an auth config for GitHub
const authConfig = await composio.authConfigs.create('github', {
  type: 'use_composio_managed_auth',
  name: 'GitHub Auth Config',
});
```

## Providers

Providers are adapters that allow tools to be used with different AI platforms or frameworks. The default provider is OpenAIProvider, which formats tools for use with OpenAI's API.

Providers handle the transformation of tools into the format required by the AI platform and manage the execution flow.

```typescript
// Example: Initialize Composio with OpenAI provider
const composio = new Composio({
  apiKey: 'your-api-key',
  provider: new OpenAIProvider(),
});
```

## Custom Tools

Custom Tools allow you to extend Composio's functionality by creating your own tools. You define the input and output parameters and provide a handler function that implements the tool's behavior.

```typescript
// Example: Create a custom tool
const customTool = await composio.tools.createCustomTool({
  name: 'My Custom Tool',
  description: 'A custom tool that does something specific',
  slug: 'MY_CUSTOM_TOOL',
  inputParameters: {
    param1: {
      type: 'string',
      description: 'First parameter',
      required: true
    }
  },
  outputParameters: {
    result: {
      type: 'string',
      description: 'The result of the operation'
    }
  },
  handler: async (params, context) => {
    // Custom logic here
    return { data: { result: 'Success!' } };
  }
});
```

## Triggers

Triggers allow your application to respond to events from external services. They define when and how your application should take action based on external events.

```typescript
// Example: Get available triggers
const triggers = await composio.triggers.get({
  toolkits: ['github'],
});
```