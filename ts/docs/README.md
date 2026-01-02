# Composio SDK v3 Documentation

Composio SDK is a powerful toolkit that enables you to integrate third-party tools and services into your applications. This SDK helps you connect to various services (toolkits), execute tools, and manage user connections seamlessly.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Providers](#providers)
- [Examples](#examples)
- [Advanced Topics](#advanced-topics)
- [Internal Documentation](#internal-documentation)

## Overview

Composio SDK allows you to:

- Execute tools from various services (like GitHub, Gmail, Slack, etc.)
- Manage user connections to external services
- Create custom tools
- Implement triggers and event handlers
- Integrate with AI providers like OpenAI

The SDK is designed to be flexible and extensible, allowing you to integrate it into various types of applications.

## Installation

```bash
npm install @composio/core
```

## Core Concepts

The Composio SDK is built around several key concepts:

- **UserIds**: Unique identifier for a user in your application (eg. UUID for a user in your database)
- **Tools**: Individual actions that can be performed (e.g., "Get GitHub Repository", "Send Email")
- **Toolkits**: Collections of related tools (e.g., GitHub, Gmail)
- **Connected Accounts**: User connections to external services
- **Auth Configs**: Authentication configurations for external services
- **Providers**: Adapters for AI services that can use tools (e.g., OpenAI)
- **Custom Tools**: Tools you can create and define yourself
- **MCP**: Create and manage MCP Servers and clients

Check out the [Core Concepts](./core-concepts.md) documentation for more detailed information.

## Getting Started

Here's a quick example of how to use the Composio SDK:

```typescript
import { Composio } from '@composio/core';

// Initialize the SDK
const composio = new Composio({
  apiKey: 'your-api-key',
});

// Get tools from a specific toolkit
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Execute a tool
const result = await composio.tools.execute('GITHUB_GET_REPO', {
  userId: 'default',
  arguments: {
    owner: 'composio',
    repo: 'sdk',
  },
});

console.log(result.data);
```

For more detailed examples and tutorials, check out the [Getting Started](./getting-started.md) guide.

## API Reference

The complete API reference documentation is available here:

- [Composio Class](./api/composio.md)
- [Tools](./api/tools.md)
- [Toolkits](./api/toolkits.md)
- [Connected Accounts](./api/connected-accounts.md)
- [Auth Configs](./api/auth-configs.md)
- [Providers](./api/providers.md)
- [Custom Tools](./api/custom-tools.md)
- [MCP](./api/mcp.md)
- [ToolRouter](./api/tool-router.md)

## Providers

Composio SDK comes with built-in support for different providers:

### Non-Agentic Providers

- [OpenAI Provider](../packages/providers/openai/README.md) - OpenAI integration with GPT-4, GPT-3.5, etc.
- [Anthropic Provider](../packages/providers/anthropic/README.md) - Anthropic Claude integration
- [Google Provider](../packages/providers/google/README.md) - Google Gemini integration
- [Cloudflare Provider](../packages/providers/cloudflare/README.md) - Cloudflare Workers AI integration

### Agentic Providers

- [LangChain Provider](../packages/providers/langchain/README.md) - LangChain integration with LCEL support
- [Mastra Provider](../packages/providers/mastra/README.md) - Agentic provider for autonomous behavior
- [Vercel Provider](../packages/providers/vercel/README.md) - Vercel AI SDK integration

## Examples

Check out our [examples directory](../examples) for complete code samples:

- [Connected Accounts](../examples/connected-accounts)
- [OpenAI Integration](../examples/openai)
- [LangChain Integration](../examples/langchain)
- [Toolkits](../examples/toolkits)
- [Triggers](../examples/triggers)
- [Modifiers](../examples/modifiers)

## Advanced Topics

- [Error Handling](./advanced/error-handling.md)
- [Telemetry](./advanced/telemetry.md)
- [Custom Providers](./advanced/custom-providers.md)
- [Modifiers](./advanced/modifiers.md)
- [Session Management](./advanced/session-management.md)

## Internal Documentation

For SDK maintainers and contributors:

- [Configuration and Environment Variables](./internal/configuration.md) - Detailed guide on SDK configuration
- [Triggers Implementation](./internal/triggers.md) - Internal workings of the trigger system
