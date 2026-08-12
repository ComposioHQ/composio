import { defineConfig } from 'tsdown';
import { baseConfig, baseNeverBundle } from '../../../tsdown.config.base.ts';

export default defineConfig({
  ...baseConfig,
  tsconfig: 'tsconfig.src.json',
  deps: {
    neverBundle: [...baseNeverBundle, '@cfworker/json-schema', 'effect'],
    onlyBundle: false,
  },
});
