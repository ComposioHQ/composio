#!/bin/bash

# Check if provider name is provided
if [ -z "$1" ]; then
    echo "Please provide a provider name"
    echo "Usage: npm run create-provider <provider-name> [--agentic]"
    exit 1
fi

TOOLSET_NAME=$1
TOOLSET_PATH="ts/packages/providers/$TOOLSET_NAME"
CAPITAL_TOOLSET_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${TOOLSET_NAME:0:1})${TOOLSET_NAME:1}"

# Check if provider should be agentic
IS_AGENTIC=false
if [ "$2" = "--agentic" ]; then
    IS_AGENTIC=true
fi

# Create directory structure
mkdir -p "$TOOLSET_PATH/src"

# Create package.json
cat > "$TOOLSET_PATH/package.json" << EOL
{
  "name": "@composio/${TOOLSET_NAME}",
  "version": "0.1.0",
  "description": "${IS_AGENTIC:+Agentic }Provider for ${TOOLSET_NAME} in Composio SDK",
  "main": "src/index.ts",
  "type": "module",
  "publishConfig": {
    "access": "public",
    "main": "dist/index.js",
    "types": "dist/index.d.ts"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "README.md",
    "dist"
  ],
  "scripts": {
    "build": "bun run --bun tsdown",
    "test": "vitest run"
  },
  "keywords": ["composio", "provider", "${TOOLSET_NAME}"],
  "author": "",
  "license": "ISC",
  "packageManager": "pnpm@10.28.0",
  "peerDependencies": {
    "@composio/core": "^0.1.0"
  },
  "devDependencies": {
    "@composio/core": "workspace:*",
    "tsdown": "catalog:",
    "typescript": "catalog:"
  }
}
EOL

# Create tsconfig.json
cat > "$TOOLSET_PATH/tsconfig.json" << EOL
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "declaration": true,
    "declarationDir": "./dist",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
EOL

# Create tsup.config.ts
cat > "$TOOLSET_PATH/tsup.config.ts" << EOL
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: false,
  outDir: 'dist',
});
EOL

# Create src/index.ts
cat > "$TOOLSET_PATH/src/index.ts" << EOL
/**
 * ${CAPITAL_TOOLSET_NAME} Provider
 *
 * This provider provides a set of tools for interacting with ${CAPITAL_TOOLSET_NAME}.
 *
 * @packageDocumentation
 * @module providers/${TOOLSET_NAME}
 */
import { ${IS_AGENTIC:+BaseAgenticProvider}${!IS_AGENTIC:+BaseNonAgenticProvider}, Tool${IS_AGENTIC:+, ExecuteToolFn} } from '@composio/core';

${IS_AGENTIC:+interface ${CAPITAL_TOOLSET_NAME}Tool {
  // Add your tool type here
}}${!IS_AGENTIC:+interface ${CAPITAL_TOOLSET_NAME}Tool {
  // Add your tool type here
}}

${IS_AGENTIC:+interface ${CAPITAL_TOOLSET_NAME}ToolCollection {
  // Add your tool collection type here
}}${!IS_AGENTIC:+type ${CAPITAL_TOOLSET_NAME}ToolCollection = Array<${CAPITAL_TOOLSET_NAME}Tool>}

export class ${CAPITAL_TOOLSET_NAME}Provider extends ${IS_AGENTIC:+BaseAgenticProvider}${!IS_AGENTIC:+BaseNonAgenticProvider}<${CAPITAL_TOOLSET_NAME}ToolCollection, ${CAPITAL_TOOLSET_NAME}Tool> {
  readonly name = '${TOOLSET_NAME}';

  /**
   * Wrap a tool in the ${TOOLSET_NAME} format.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  ${IS_AGENTIC:+wrapTool(tool: Tool, executeTool: ExecuteToolFn): ${CAPITAL_TOOLSET_NAME}Tool {
    return {
      // Implement your tool wrapping logic here
    } as ${CAPITAL_TOOLSET_NAME}Tool;
  }}${!IS_AGENTIC:+wrapTool(tool: Tool): ${CAPITAL_TOOLSET_NAME}Tool {
    return {
      // Implement your tool wrapping logic here
    } as ${CAPITAL_TOOLSET_NAME}Tool;
  }}

  /**
   * Wrap a list of tools in the ${TOOLSET_NAME} format.
   * @param tools - The tools to wrap.
   * @returns The wrapped tools.
   */
  ${IS_AGENTIC:+wrapTools(tools: Tool[], executeTool: ExecuteToolFn): ${CAPITAL_TOOLSET_NAME}ToolCollection {
    return tools.reduce((acc, tool) => {
      // Implement your tool collection wrapping logic here
      return acc;
    }, {} as ${CAPITAL_TOOLSET_NAME}ToolCollection);
  }}${!IS_AGENTIC:+wrapTools(tools: Tool[]): ${CAPITAL_TOOLSET_NAME}ToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }}
}
EOL

# Create README.md
cat > "$TOOLSET_PATH/README.md" << EOL
# @composio/${TOOLSET_NAME}

${IS_AGENTIC:+Agentic }Provider for ${CAPITAL_TOOLSET_NAME} in Composio SDK.

## Features

${IS_AGENTIC:+- **Full Modifier Support**: Support for both schema and execution modifiers
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions}${!IS_AGENTIC:+- **Schema Modifiers**: Support for transforming tool schemas
- **Type Safety**: Full TypeScript support with proper type definitions}

## Installation

\`\`\`bash
npm install @composio/${TOOLSET_NAME}
# or
yarn add @composio/${TOOLSET_NAME}
# or
pnpm add @composio/${TOOLSET_NAME}
\`\`\`

## Quick Start

\`\`\`typescript
import { Composio } from '@composio/core';
import { ${CAPITAL_TOOLSET_NAME}Provider } from '@composio/${TOOLSET_NAME}';

// Initialize Composio with ${CAPITAL_TOOLSET_NAME} provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new ${CAPITAL_TOOLSET_NAME}Provider(),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});
\`\`\`

## Usage Examples

### Basic Example

\`\`\`typescript
import { Composio } from '@composio/core';
import { ${CAPITAL_TOOLSET_NAME}Provider } from '@composio/${TOOLSET_NAME}';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new ${CAPITAL_TOOLSET_NAME}Provider(),
});

// Get tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
});

// Use tools with ${CAPITAL_TOOLSET_NAME}
// Add your usage example here
\`\`\`

## API Reference

### ${CAPITAL_TOOLSET_NAME}Provider Class

The \`${CAPITAL_TOOLSET_NAME}Provider\` class extends \`${IS_AGENTIC:+BaseAgenticProvider}${!IS_AGENTIC:+BaseNonAgenticProvider}\` and provides ${TOOLSET_NAME}-specific functionality.

#### Methods

##### \`wrapTool(tool: Tool${IS_AGENTIC:+, executeTool: ExecuteToolFn}): ${CAPITAL_TOOLSET_NAME}Tool\`

Wraps a tool in the ${TOOLSET_NAME} format.

\`\`\`typescript
const tool = provider.wrapTool(composioTool${IS_AGENTIC:+, executeTool});
\`\`\`

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
EOL

# Make the script executable
chmod +x "$TOOLSET_PATH"

# Install dependencies using pnpm
cd "$TOOLSET_PATH" && pnpm install

echo "✨ Created new ${IS_AGENTIC:+agentic }provider at $TOOLSET_PATH"
echo "✨ Dependencies installed successfully"    