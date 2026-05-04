import { defineConfig } from 'vitest/config';
import path from 'node:path';

const __dirname = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const coreDir = path.resolve(__dirname, '../core');
const tsBuildersDir = path.resolve(__dirname, '../ts-builders');
const jsonSchemaToZodDir = path.resolve(__dirname, '../json-schema-to-zod');

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      src: path.resolve(__dirname, './src'),
      test: path.resolve(__dirname, './test'),
      '@composio/core': path.join(coreDir, 'src/index.ts'),
      '@composio/ts-builders': path.join(tsBuildersDir, 'src/index.ts'),
      '@composio/json-schema-to-zod': path.join(jsonSchemaToZodDir, 'src/index.ts'),
      'effect-errors/*': path.resolve(__dirname, './src/effect-errors'),
      // @composio/core uses package.json "imports" (#config_defaults, #platform, etc.)
      // Vitest/Vite does not resolve these for workspace deps, so alias them explicitly
      '#config_defaults': path.join(coreDir, 'src/utils/config-defaults/ConfigDefaults.node.ts'),
      '#platform': path.join(coreDir, 'src/platform/node.ts'),
      '#files': path.join(coreDir, 'src/models/Files.node.ts'),
      '#file_tool_modifier': path.join(coreDir, 'src/utils/modifiers/FileToolModifier.node.ts'),
    },
  },
  test: {
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    include: ['test/**/*.test.ts'],
    // When defined, Vitest will run all matched files with import.meta.vitest inside.
    includeSource: ['src/**/*.ts', 'test/__utils__/*-compiler.ts'],
    unstubEnvs: true,
    globalSetup: './test/__utils__/vitest.global-setup.ts',
  },
});
