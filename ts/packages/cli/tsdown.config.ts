import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/bin.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: false,
  outDir: 'dist',
  tsconfig: './tsconfig.src.json',
  banner: {
    js: '#!/usr/bin/env bun',
  },
});
