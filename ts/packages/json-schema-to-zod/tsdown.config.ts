import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base.ts';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/v4.ts'],
  tsconfig: 'tsconfig.src.json',
  attw: { ...baseConfig.attw, entrypoints: ['.', './v4'] },
});
