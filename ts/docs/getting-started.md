# Getting Started with Composio SDK

This guide will help you get started with the Composio SDK. You'll learn how to install it, initialize it, and use it to execute tools, manage connected accounts, and integrate with AI providers.

## Installation

Install the Composio SDK using npm, yarn, or pnpm:

```bash
# Using npm
npm install @composio/core

# Using yarn
yarn add @composio/core

# Using pnpm
pnpm add @composio/core
```

## Initialization

To use the SDK, you need to initialize it with your API key:

```typescript
import { Composio } from '@composio/core';

// Initialize the SDK
const composio = new Composio({
  apiKey: 'your-api-key',
});
```

You can also customize the initialization with additional options:

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

// Initialize with custom provider and options
const composio = new Composio({
  apiKey: 'your-api-key',
  baseURL: 'https://api.composio.dev', // Optional: Custom API endpoint
  allowTracking: true, // Optional: Enable/disable telemetry
  provider: new OpenAIProvider(), // Optional: Custom provider
  toolkitVersions: { github: '12082025_00', slack: 'latest' }, // Optional: Toolkit versions
});
```

### Toolkit Versions

Toolkit versions allow you to pin specific versions of tools and triggers, ensuring consistency across your application. By default, Composio uses the `'latest'` version for all toolkits, but you can specify exact versions for production stability.

#### Version Format

Toolkit versions follow the format `DDMMYYYY_NN`, where:
- `DD` = Day (01-31)
- `MM` = Month (01-12)
- `YYYY` = Year
- `NN` = Version number for that day (00, 01, 02, etc.)

Example: `12082025_00` represents version 00 released on August 12, 2025.

#### Configuration Options

**Option 1: Specific Versions per Toolkit (Recommended for Production)**

```typescript
const composio = new Composio({
  toolkitVersions: {
    github: '12082025_00',
    slack: '10082025_01',
    gmail: 'latest', // You can mix specific versions with 'latest'
  }
});
```

**Option 2: Using Environment Variables**

You can set toolkit versions using environment variables:

```bash
# Set specific versions for individual toolkits
export COMPOSIO_TOOLKIT_VERSION_GITHUB=12082025_00
export COMPOSIO_TOOLKIT_VERSION_SLACK=10082025_01
export COMPOSIO_TOOLKIT_VERSION_GMAIL=latest
```

Then initialize Composio without specifying `toolkitVersions`:

```typescript
const composio = new Composio({
  apiKey: 'your-api-key'
  // Will automatically use environment variables
});
```

**Option 3: Latest version for all toolkits**
If omitted, SDK will use `latest` version for all the toolkits

```typescript
const composio = new Composio({
  apiKey: 'your-api-key',
  // since omitted, this will use `latest` for all toolkits
})
```

#### Version Behavior

- **Tools & Triggers:** The toolkit version configuration applies to both tools and triggers
- **Override Support:** Tools can override the global version for specific operations:
  - When executing tools: Pass a `version` parameter in the execute call to override the configured version
- **Defaults:** If no version is specified, the SDK defaults to `'latest'`
- **Triggers:** Trigger types always use the global toolkit version configured at initialization. To use a specific version for triggers, set it in the `toolkitVersions` configuration when creating the Composio instance.

#### Best Practices

1. **Use `'latest'` for Development:** Get the newest features and improvements automatically
2. **Pin Versions in Production:** Use specific version numbers to prevent unexpected changes
3. **Test Before Upgrading:** When moving to a new version, test thoroughly before deploying
4. **Version Per Toolkit:** Different toolkits can use different versions based on your needs

#### Example: Production Configuration

```typescript
import { Composio } from '@composio/core';

// Production setup with pinned versions
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolkitVersions: {
    // Pin critical toolkits to stable versions
    github: '12082025_00',
    slack: '10082025_01',
    gmail: '15082025_00',
    // Use latest for non-critical toolkits
    hackernews: 'latest'
  }
});
```

## Basic Usage

### Listing Available Toolkits

Toolkits are collections of related tools (like GitHub, Gmail, etc.). You can list all available toolkits:

```typescript
// Get all toolkits
const allToolkits = await composio.toolkits.get({});
console.log(allToolkits.items);

// Get toolkits by category
const devToolkits = await composio.toolkits.get({
  category: 'developer-tools',
});
```

### Getting Tools from a Toolkit

You can get tools from a specific toolkit:

```typescript
// Get all tools from the GitHub toolkit
const githubTools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Get a specific tool by slug
const getRepoTool = await composio.tools.get('default', 'GITHUB_GET_REPO');
```

### Executing a Tool

To execute a tool, you need to provide the tool's slug and the parameters:

```typescript
// Execute a GitHub tool
const result = await composio.tools.execute('GITHUB_GET_REPO', {
  userId: 'default',
  arguments: {
    owner: 'composio',
    repo: 'sdk',
  },
});

// Check if the execution was successful
if (result.successful) {
  console.log('Repository details:', result.data);
} else {
  console.error('Error:', result.error);
}
```

## Working with Connected Accounts

Many tools require authentication with external services. Composio manages this through connected accounts.

### Setting Up a Connection

To create a connected account, you need to:

1. Authorize the toolkit
2. Wait for the user to complete the authentication flow

```typescript
// Step 1: Authorize the toolkit
const connectionRequest = await composio.toolkits.authorize('user123', 'github');

// This gives you a redirect URL
console.log('Redirect the user to:', connectionRequest.redirectUrl);

// Step 2: Wait for the connection to be established
// This should be called after the user completes the auth flow
const connectedAccount = await composio.connectedAccounts.waitForConnection(connectionRequest.id);
console.log('Connected account:', connectedAccount);
```

### Using a Connected Account with Tools

Once you have a connected account, you can use it when executing tools:

```typescript
// Execute a tool with a connected account
const result = await composio.tools.execute('GITHUB_GET_REPOS', {
  userId: 'user123',
  connectedAccountId: connectedAccount.id,
  arguments: {},
});
```

## Integration with OpenAI

Composio integrates seamlessly with OpenAI. Here's an example of using Composio tools with OpenAI:

```typescript
import { Composio } from '@composio/core';
import OpenAI from 'openai';

// Initialize Composio and OpenAI
const composio = new Composio({
  apiKey: 'your-composio-api-key',
});

const openai = new OpenAI({
  apiKey: 'your-openai-api-key',
});

// Get tools from the GitHub toolkit
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Create a chat completion with OpenAI using the tools
const completion = await openai.chat.completions.create({
  model: 'gpt-5',
  messages: [
    { role: 'system', content: 'You are a helpful assistant with access to GitHub tools.' },
    { role: 'user', content: 'List the repositories in the Composio organization' },
  ],
  tools, // Pass the tools to OpenAI
});

// If the assistant wants to use a tool
if (completion.choices[0].message.tool_calls) {
  // Execute each tool call
  for (const toolCall of completion.choices[0].message.tool_calls) {
    // Parse the arguments
    const args = JSON.parse(toolCall.function.arguments);

    // Execute the tool
    const result = await composio.tools.execute(toolCall.function.name, {
      userId: 'default',
      arguments: args,
    });

    // Use the result in your application
    console.log(`Tool ${toolCall.function.name} result:`, result.data);
  }
}
```

For a more complete integration, check out the [OpenAI Provider example](../examples/openai).

## Creating Custom Tools

You can extend Composio by creating your own custom tools:

```typescript
import { z } from 'zod';

// Create a custom tool
const customTool = await composio.tools.createCustomTool({
  name: 'Weather Forecast',
  description: 'Get the weather forecast for a location',
  slug: 'WEATHER_FORECAST',
  inputParams: z.object({
    location: z.string().describe('The location to get the forecast for'),
    days: z.number().optional().default(3).describe('Number of days for the forecast')
  }),
  execute: async (input) => {
    try {
      const { location, days = 3 } = input;

      // Here you would call your weather API
      const forecast = await getWeatherForecast(location, days);

      return {
        data: { forecast },
        error: null,
        successful: true,
      };
    } catch (error) {
      return {
        data: {},
        successful: false,
        error: error.message,
      };
    }
  },
});

// Now you can use your custom tool
const result = await composio.tools.execute('WEATHER_FORECAST', {
  userId: 'default',
  arguments: {
    location: 'San Francisco, CA',
    days: 5,
  },
});

console.log(result.data.forecast);
```

For more advanced session management features, check out the [Session Management Guide](./advanced/session-management.md).

## Next Steps

Now that you understand the basics, you can:

- Explore [more examples](../examples) to see how to use Composio in different scenarios
- Learn about [custom providers](./api/providers.md) to integrate with other AI frameworks
- Understand [error handling](./advanced/error-handling.md) to make your application more robust
- Implement [modifiers](./advanced/modifiers.md) to customize tool execution
