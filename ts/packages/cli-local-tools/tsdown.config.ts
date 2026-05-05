import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base.ts';

export default defineConfig({
  ...baseConfig,
  tsconfig: 'tsconfig.src.json',
});
