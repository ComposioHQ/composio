
<div align="center">

<img src="https://raw.githubusercontent.com/ComposioHQ/composio/next/public/logo.png" alt="Composio Logo" width="200" height="auto" style="margin-bottom: 20px;"/>


# Composio SDK

Skills that evolve for your Agents

[🌐 Website](https://composio.dev) • [📚 Documentation](https://docs.composio.dev)

[![GitHub Stars](https://img.shields.io/github/stars/ComposioHQ/composio?style=social)](https://github.com/ComposioHQ/composio/stargazers)
[![PyPI Downloads](https://img.shields.io/pypi/dm/composio?label=PyPI%20Downloads)](https://pypi.org/project/composio/)
[![NPM Downloads](https://img.shields.io/npm/dt/@composio/core?label=NPM%20Downloads)](https://www.npmjs.com/package/@composio/core)
</div>

This repository contains the official Software Development Kits (SDKs) for Composio, providing seamless integration capabilities across multiple programming languages.

## Repository Structure

```
composio/
├── python/         # Python SDK
└── ts/         # TypeScript SDK
```



## Getting Started

### TypeScript SDK Installation

```bash
# Using npm
npm install @composio/core@next

# Using yarn
yarn add @composio/core@next

# Using pnpm
pnpm add @composio/core@next
```

#### Quick start:

```typescript
import { Composio } from '@composio/core';
// Initialize the SDK
const composio = new Composio({
  // apiKey: 'your-api-key',
});
```

#### Simple Agent with OpenAI

```bash
npm install @composio/openai
```

```typescript
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider, OpenAIProvider } from '@composio/openai';
import { OpenAI } from 'openai';

const openai = new OpenAI();

const composioForCompletions = new Composio({ provider: new OpenAIProvider() });
const toolsForCompletions = await composioForCompletions.tools.get(userId, {
  toolkits: ['HACKERNEWS'],
});

const completion = await openai.chat.completions.create({
  model: 'gpt-5',
  messages: [
    {
      role: 'user',
      content: 'What is the latest hackernews post about?',
    },
  ],
  tools: toolsForCompletions,
});

const newResult = await composioForCompletions.provider.handleToolCalls(userId, completion);

console.log(JSON.stringify(newResult, null, 2));
// will return the raw response from the HACKERNEWS API.
```

### Python SDK Installation

```bash
# Using pip
pip install composio

# Using poetry
poetry add composio
```

#### Quick start:

```python
from composio import Composio


composio = Composio(
  # api_key="your-api-key",
)
```

#### Simple Agent with OpenAI

```bash
pip install composio_openai>=0.8.0
```

```python
from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider

# Initialize Composio client with OpenAI Provider
composio = Composio(provider=OpenAIProvider())
openai = OpenAI()

user_id = "user@acme.org"
tools = composio.tools.get(user_id=user_id, toolkits=["HACKERNEWS"])

response = openai.chat.completions.create(
    model="gpt-5",
    tools=tools,
    messages=[
        {"role": "user", "content": "What's the latest Hackernews post about?"},
    ],
)

# Execute the function calls.
result = composio.provider.handle_tool_calls(response=response, user_id=user_id)
print(result)
# will return the raw response from the HACKERNEWS API.
```

For more detailed usage instructions and examples, please refer to each SDK's specific documentation.

## Available SDKs

### TypeScript SDK (/ts)

The TypeScript SDK provides a modern, type-safe way to interact with Composio's services. It's designed for both Node.js and browser environments, offering full TypeScript support with comprehensive type definitions.

For detailed information about the TypeScript SDK, please refer to the [TypeScript SDK Documentation](/ts/README.md).

### Python SDK (/python)

The Python SDK offers a Pythonic interface to Composio's services, making it easy to integrate Composio into your Python applications. It supports Python 3.7+ and follows modern Python development practices.

For detailed information about the Python SDK, please refer to the [Python SDK Documentation](/python/README.md).

_if you are looking for the older sdk, you can find them [here](https://github.com/ComposioHQ/composio/tree/master)_

## Contributing

We welcome contributions to both SDKs! Please read our contribution guidelines before submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions about the SDKs:

- Open an issue in this repository
- Contact our [support team](mailto:support@composio.dev)
- Check our [documentation](https://docs.composio.dev/)
