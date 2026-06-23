import { defineConfig } from 'vitest/config';
import path from 'node:path';

const __dirname = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const coreDir = path.resolve(__dirname, '../core');
const jsonSchemaToZodDir = path.resolve(__dirname, '../json-schema-to-zod');

export default defineConfig({
  resolve: {
    alias: {
      '@composio/core': path.join(coreDir, 'src/index.ts'),
      '@composio/json-schema-to-zod': path.join(jsonSchemaToZodDir, 'src/index.ts'),
      '#config_defaults': path.join(coreDir, 'src/utils/config-defaults/ConfigDefaults.node.ts'),
      '#platform': path.join(coreDir, 'src/platform/node.ts'),
      '#files': path.join(coreDir, 'src/models/Files.node.ts'),
      '#file_tool_modifier': path.join(coreDir, 'src/utils/modifiers/FileToolModifier.node.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
