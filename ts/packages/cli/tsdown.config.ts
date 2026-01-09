import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base';

export default defineConfig({
  ...baseConfig,
  entry: ['src/bin.ts'],
  format: ['esm'],
  tsconfig: './tsconfig.src.json',
  banner: {
    js: '#!/usr/bin/env bun',
  },
  external: undefined,
});
