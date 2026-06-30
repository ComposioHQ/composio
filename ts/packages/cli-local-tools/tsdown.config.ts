import { defineConfig } from 'tsdown';
import { baseConfig, baseNeverBundle } from '../../../tsdown.config.base.ts';

export default defineConfig({
  ...baseConfig,
  tsconfig: 'tsconfig.src.json',
  deps: {
    ...baseConfig.deps,
    neverBundle: [...baseNeverBundle, /^bun:/, /^@composio\/core(\/.*)?$/],
  },
});
