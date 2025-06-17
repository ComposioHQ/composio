# Composio SDK

This repository contains the official Software Development Kits (SDKs) for Composio, providing seamless integration capabilities across multiple programming languages.

## Repository Structure

```
composio/
├── py/         # Python SDK
└── ts/         # TypeScript SDK
```

## Available SDKs

### TypeScript SDK (/ts)

The TypeScript SDK provides a modern, type-safe way to interact with Composio's services. It's designed for both Node.js and browser environments, offering full TypeScript support with comprehensive type definitions.

For detailed information about the TypeScript SDK, please refer to the [TypeScript SDK Documentation](/ts/README.md).

### Python SDK (/py)

The Python SDK offers a Pythonic interface to Composio's services, making it easy to integrate Composio into your Python applications. It supports Python 3.7+ and follows modern Python development practices.

For detailed information about the Python SDK, please refer to the [Python SDK Documentation](/py/README.md).

## Getting Started

### TypeScript SDK Installation

```bash
# Using npm
npm install @composio/core

# Using yarn
yarn add @composio/core

# Using pnpm
pnpm add @composio/core
```

Quick start:

```typescript
import { Composio } from '@composio/core';

const client = new Composio({
  apiKey: 'your-api-key',
});
```

### Python SDK Installation

```bash
# Using pip
pip install composio-core

# Using poetry
poetry add composio-core
```

Quick start:

```python
from composio.core import Composio

client = ComposioClient(
    api_key='your-api-key'
)
```

For more detailed usage instructions and examples, please refer to each SDK's specific documentation.

## Contributing

We welcome contributions to both SDKs! Please read our contribution guidelines before submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions about the SDKs:

- Open an issue in this repository
- Contact our support team
- Check our documentation
