#!/bin/bash

# Check if toolset name is provided
if [ -z "$1" ]; then
    echo "Please provide a toolset name"
    echo "Usage: npm run create-toolset <toolset-name>"
    exit 1
fi

TOOLSET_NAME=$1
TOOLSET_PATH="packages/toolsets/$TOOLSET_NAME"
CAPITAL_TOOLSET_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${TOOLSET_NAME:0:1})${TOOLSET_NAME:1}"

# Create directory structure
mkdir -p "$TOOLSET_PATH/src"

# Create package.json
cat > "$TOOLSET_PATH/package.json" << EOL
{
  "name": "@composio/${TOOLSET_NAME}-toolset",
  "version": "1.0.0",
  "description": "",
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
  "keywords": [],
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
import { BaseComposioToolset } from "@composio/core";
import type { Tool, ToolListParams } from "@composio/core";

interface ToolType {
    // Add your tool type here
}

interface ToolCollection {
  // Add your tool collection here
}

export class ${CAPITAL_TOOLSET_NAME}Toolset extends BaseComposioToolset<ToolCollection, ToolType> {
  static FRAMEWORK_NAME = "${TOOLSET_NAME}";
  private DEFAULT_ENTITY_ID = "default";
  readonly FILE_NAME: string = "toolsets/${TOOLSET_NAME}/src/index.ts";

  /**
   * Abstract method to wrap a tool in the toolset.
   * This method is implemented by the toolset.
   * @param tool - The tool to wrap.
   * @returns The wrapped tool.
   */
  _wrapTool = (tool: Tool): ToolType => {
    return tool as ToolType;
  }

  /**
   * Get all the tools from the Composio API
   * @param query - The query to get the tools
   * @returns The tools
   */
  getTools = async (query?: ToolListParams): Promise<ToolCollection> => {
    return [];
  }
}
EOL

# Make the script executable
chmod +x "$TOOLSET_PATH"

# Install dependencies using pnpm
cd "$TOOLSET_PATH" && pnpm install

echo "✨ Created new toolset at $TOOLSET_PATH"
echo "✨ Dependencies installed successfully" 