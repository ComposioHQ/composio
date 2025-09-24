![Composio Banner](https://github.com/user-attachments/assets/9ba0e9c1-85a4-4b51-ae60-f9fe7992e819)

# Composio SDK

| This is the preview for our next generation sdk, you can learn more about them here and how to move here https://v3.docs.composio.dev/docs/migration

_if you are looking for the older sdk, you can find them [here](https://github.com/ComposioHQ/composio/tree/master)_

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

Quick start:

```typescript
import { Composio } from '@composio/core';
// Initialize the SDK
const composio = new Composio({
  // apiKey: 'your-api-key',
});
```

### Python SDK Installation

```bash
# Using pip
pip install composio

# Using poetry
poetry add composio
```

Quick start:

```python
from composio import Composio


composio = Composio(
  # api_key="your-api-key",
)
```

For more detailed usage instructions and examples, please refer to each SDK's specific documentation.

## Available SDKs

### TypeScript SDK (/ts)

The TypeScript SDK provides a modern, type-safe way to interact with Composio's services. It's designed for both Node.js and browser environments, offering full TypeScript support with comprehensive type definitions.

For detailed information about the TypeScript SDK, please refer to the [TypeScript SDK Documentation](/ts/README.md).

### Python SDK (/python)

The Python SDK offers a Pythonic interface to Composio's services, making it easy to integrate Composio into your Python applications. It supports Python 3.10+ and follows modern Python development practices.

For detailed information about the Python SDK, please refer to the [Python SDK Documentation](/python/README.md).


## Contributing

We welcome contributions to both SDKs! Please read our contribution guidelines before submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions about the SDKs:

- Open an issue in this repository
- Contact our [support team](mailto:support@composio.dev)
- Check our [documentation](https://docs.composio.dev/)
