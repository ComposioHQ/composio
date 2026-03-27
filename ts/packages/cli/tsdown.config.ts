import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base';

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/bin.ts',
    'src/services/run-subagent-shared.ts',
    'src/services/run-subagent-acp.ts',
    'src/services/run-subagent-legacy.ts',
    'src/services/run-subagent-output-mcp.ts',
  ],
  format: ['esm'],
  tsconfig: './tsconfig.src.json',
  external: undefined,
  publint: undefined,
  attw: undefined,
});
