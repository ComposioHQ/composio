import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../../tsdown.config.base.js';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  outDir: 'dist',
  tsconfig: 'tsconfig.json',
});
