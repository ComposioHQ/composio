import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base.ts';

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
  external: [/^bun:/],
  noExternal: [
    '@composio/core',
    '@composio/cli-local-tools',
    /^zod(?:\/.*)?$/,
    /^@agentclientprotocol\/sdk(?:\/.*)?$/,
    /^@modelcontextprotocol\/sdk(?:\/.*)?$/,
  ],
  publint: undefined,
  attw: undefined,
});
