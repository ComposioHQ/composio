import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base.ts';

export default defineConfig({
  ...baseConfig,
  entry: ['src/bin.ts', 'src/services/generation-runtime.ts'],
  format: ['esm'],
  shims: true,
  tsconfig: './tsconfig.src.json',
  deps: {
    ...baseConfig.deps,
    neverBundle: [/^bun:/, /^node:/],
    alwaysBundle: ['@composio/core', /^zod(?:\/.*)?$/],
  },
  publint: undefined,
  attw: undefined,
});
