import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../../tsdown.config.base.js';

export default defineConfig({
  ...baseConfig,
  tsconfig: 'tsconfig.json',
});
