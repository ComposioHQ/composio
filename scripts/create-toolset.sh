#!/bin/bash

# Check if toolset name is provided
if [ -z "$1" ]; then
    echo "Please provide a toolset name"
    echo "Usage: npm run create-toolset <toolset-name> [--agentic]"
    exit 1
fi

TOOLSET_NAME=$1
TOOLSET_PATH="packages/toolsets/$TOOLSET_NAME"
CAPITAL_TOOLSET_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${TOOLSET_NAME:0:1})${TOOLSET_NAME:1}"

# Check if toolset should be agentic
IS_AGENTIC=false
if [ "$2" = "--agentic" ]; then
    IS_AGENTIC=true
fi

# Create directory structure
mkdir -p "$TOOLSET_PATH/src"

# Create package.json
cat > "$TOOLSET_PATH/package.json" << EOL
{
  "name": "@composio/${TOOLSET_NAME}-toolset",
  "version": "1.0.0",
  "description": "${IS_AGENTIC:+Agentic }Toolset for ${TOOLSET_NAME}",
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
  "scripts": {
    "build": "tsup",
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "keywords": ["composio", "toolset", "${TOOLSET_NAME}"],
  "author": "",
  "license": "ISC",
  "packageManager": "pnpm@10.8.0",
  "devDependencies": {
    "tsup": "^8.4.0",
    "typescript": "^5.8.3"
  },
  "dependencies": {
    "@composio/core": "workspace:^"
  }
}
EOL

# Create tsconfig.json
cat > "$TOOLSET_PATH/tsconfig.json" << EOL
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "declaration": true,
    "declarationDir": "./dist",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "skipLibCheck": true
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
import { ${IS_AGENTIC:+BaseAgenticToolset}${!IS_AGENTIC:+BaseNonAgenticToolset} } from "@composio/core";
import type { Tool, ToolListParams } from "@composio/core";
import type { ${IS_AGENTIC:+ModifiersParams}${!IS_AGENTIC:+SchemaModifiersParams} } from "@composio/core";

interface ToolType {
    // Add your tool type here
}

interface ToolCollection {
  // Add your tool collection here
}

/**
 * ${CAPITAL_TOOLSET_NAME} Toolset
 * ${IS_AGENTIC:+This is an agentic toolset that supports full modifier capabilities.}
${!IS_AGENTIC:+This is a non-agentic toolset that only supports schema modifiers.}
 * 
 * @example
 * \`\`\`typescript
 * import { Composio } from "@composio/core";
 * import { ${CAPITAL_TOOLSET_NAME}Toolset } from "@composio/${TOOLSET_NAME}-toolset";
 * 
 * const composio = new Composio({
 *   apiKey: "your-api-key",
 *   toolset: new ${CAPITAL_TOOLSET_NAME}Toolset()
 * });
 * \`\`\`
 */
export class ${CAPITAL_TOOLSET_NAME}Toolset extends ${IS_AGENTIC:+BaseAgenticToolset}${!IS_AGENTIC:+BaseNonAgenticToolset}<ToolCollection, ToolType> {
  static FRAMEWORK_NAME = "${TOOLSET_NAME}";
  readonly FILE_NAME: string = "toolsets/${TOOLSET_NAME}/src/index.ts";

  /**
   * Wraps a tool in the toolset format.
   * This method is implemented by the toolset.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  wrapTool = (tool: Tool): ToolType => {
    return tool as ToolType;
  }

  /**
   * Get all the tools from the Composio API
   * @param params - The query parameters to get the tools
   * @param modifiers - ${IS_AGENTIC:+Full modifiers to apply to the tools}${!IS_AGENTIC:+Schema modifiers to apply to the tools}
   * @returns The tools
   */
  getTools = async (
    params?: ToolListParams,
    modifiers?: ${IS_AGENTIC:+ModifiersParams}${!IS_AGENTIC:+SchemaModifiersParams}
  ): Promise<ToolCollection> => {
    return [];
  }

  /**
   * Get a tool from the Composio API by its slug
   * @param slug - The slug of the tool to get
   * @param modifiers - ${IS_AGENTIC:+Full modifiers to apply to the tool}${!IS_AGENTIC:+Schema modifiers to apply to the tool}
   * @returns The tool
   */
  getToolBySlug = async (
    slug: string,
    modifiers?: ${IS_AGENTIC:+ModifiersParams}${!IS_AGENTIC:+SchemaModifiersParams}
  ): Promise<ToolType> => {
    const tool = await this.getComposio().tools.getToolBySlug(slug, modifiers?.schema);
    return this.wrapTool(tool);
  }
}
EOL

# Create README.md
cat > "$TOOLSET_PATH/README.md" << EOL
# @composio/${TOOLSET_NAME}-toolset

${IS_AGENTIC:+Agentic }Toolset for ${TOOLSET_NAME} in Composio SDK.

## Installation

\`\`\`bash
pnpm add @composio/${TOOLSET_NAME}-toolset
\`\`\`

## Usage

\`\`\`typescript
import { Composio } from "@composio/core";
import { ${CAPITAL_TOOLSET_NAME}Toolset } from "@composio/${TOOLSET_NAME}-toolset";

const composio = new Composio({
  apiKey: "your-api-key",
  toolset: new ${CAPITAL_TOOLSET_NAME}Toolset()
});

// Get all tools
const tools = await composio.getTools();

// Get a specific tool by slug
const tool = await composio.getToolBySlug("tool-slug");
\`\`\`

## Features

${IS_AGENTIC:+This is an agentic toolset that supports full modifier capabilities, including:
- Tool execution modifiers
- Schema modifiers
- Custom modifiers

}${!IS_AGENTIC:+This is a non-agentic toolset that supports schema modifiers for transforming tool schemas.}

## License

ISC
EOL

# Make the script executable
chmod +x "$TOOLSET_PATH"

# Install dependencies using pnpm
cd "$TOOLSET_PATH" && pnpm install

echo "✨ Created new ${IS_AGENTIC:+agentic }toolset at $TOOLSET_PATH"
echo "✨ Dependencies installed successfully" 