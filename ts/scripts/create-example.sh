#!/bin/bash

# Check if example name is provided
if [ -z "$1" ]; then
    echo "Please provide an example name"
    echo "Usage: pnpm create:example <example-name>"
    exit 1
fi

EXAMPLE_NAME=$1
EXAMPLE_PATH="ts/examples/$EXAMPLE_NAME"
CAPITAL_EXAMPLE_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${EXAMPLE_NAME:0:1})${EXAMPLE_NAME:1}"

# Check if example directory already exists
if [ -d "$EXAMPLE_PATH" ]; then
    echo "❌ Example '$EXAMPLE_NAME' already exists in $EXAMPLE_PATH"
    exit 1
fi

# Create directory structure
mkdir -p "$EXAMPLE_PATH/src"

# Create package.json
cat > "$EXAMPLE_PATH/package.json" << EOL
{
  "name": "${EXAMPLE_NAME}-example",
  "private": true,
  "version": "0.1.0",
  "description": "Example project for ${CAPITAL_EXAMPLE_NAME}",
  "main": "src/index.ts",
  "scripts": {
    "start": "bun src/index.ts",
    "dev": "bun --watch src/index.ts",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["composio", "example", "${EXAMPLE_NAME}"],
  "author": "",
  "license": "ISC",
  "packageManager": "pnpm@10.28.0",
  "dependencies": {
    "@composio/core": "workspace:*",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "@types/bun": "^1.2.9",
    "typescript": "catalog:"
  }
}
EOL

# Create tsconfig.json
cat > "$EXAMPLE_PATH/tsconfig.json" << EOL
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "declaration": true,
    "declarationDir": "./dist",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
EOL

# Create .env.example
cat > "$EXAMPLE_PATH/.env.example" << EOL
# Composio API Key - Get it from https://app.composio.dev
COMPOSIO_API_KEY=your_composio_api_key_here

# Add other environment variables as needed for your example
# OPENAI_API_KEY=your_openai_api_key_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here
EOL

# Create .env (copy of .env.example)
cp "$EXAMPLE_PATH/.env.example" "$EXAMPLE_PATH/.env"

# Create src/index.ts
cat > "$EXAMPLE_PATH/src/index.ts" << EOL
/**
 * ${CAPITAL_EXAMPLE_NAME} Example
 *
 * This example demonstrates how to use Composio SDK for ${EXAMPLE_NAME}.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */

import { Composio } from '@composio/core';
import 'dotenv/config';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting ${CAPITAL_EXAMPLE_NAME} Example...');
    
    // Get available tools
    const tools = await composio.tools.get('default', {
      // Specify the apps you want to use
      toolkits: ['gmail', 'googlecalendar'],
      limit: 10,
    });
    
    console.log(\`✅ Found \${tools.length} tools\`);
    
    // TODO: Add your example implementation here
    console.log('📝 Implement your ${EXAMPLE_NAME} logic here!');
    
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
EOL

# Create README.md
cat > "$EXAMPLE_PATH/README.md" << EOL
# ${CAPITAL_EXAMPLE_NAME} Example

This example demonstrates how to use Composio SDK for ${EXAMPLE_NAME}.

## Setup

1. **Install dependencies:**
   \`\`\`bash
   pnpm install
   \`\`\`

2. **Configure environment:**
   \`\`\`bash
   cp .env.example .env
   \`\`\`
   
   Then edit \`.env\` and add your API keys:
   - \`COMPOSIO_API_KEY\`: Get it from [Composio Dashboard](https://app.composio.dev)

## Running the Example

\`\`\`bash
# Run the example
pnpm start

# Run in development mode (with file watching)
pnpm dev
\`\`\`

## What This Example Does

- Initializes Composio SDK
- Fetches available tools
- Demonstrates basic usage patterns

## Customization

Edit \`src/index.ts\` to:
- Add specific apps you want to integrate with
- Implement your business logic
- Add error handling and logging

## Related Examples

- [OpenAI Example](../openai) - Shows integration with OpenAI
- [LangChain Example](../langchain) - Shows integration with LangChain
- [More Examples](../) - Browse all available examples

## Support

- [Documentation](https://docs.composio.dev)
- [Discord Community](https://discord.gg/composio)
- [GitHub Issues](https://github.com/composio/composio/issues)
EOL

# Install dependencies using pnpm
cd "$EXAMPLE_PATH" && pnpm install

echo "✨ Created new example at $EXAMPLE_PATH"
echo "✨ Dependencies installed successfully"
echo ""
echo "📁 Generated files:"
echo "   - package.json"
echo "   - tsconfig.json" 
echo "   - .env.example"
echo "   - .env"
echo "   - src/index.ts"
echo "   - README.md"
echo ""
echo "🚀 Next steps:"
echo "   1. cd $EXAMPLE_PATH"
echo "   2. Edit .env and add your COMPOSIO_API_KEY"
echo "   3. pnpm start" 