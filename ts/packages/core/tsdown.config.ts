import { defineConfig, UserConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base';

/**
 * Note: we don't want to accidentally bundle `node:*` packages (e.g., `node:module`)
 * as not all of them are available in Cloudflare Workers / Vercel Edge runtimes.
 */
const external = [
  ...(baseConfig.external ?? []),
  '#platform',
].flat() satisfies UserConfig['external'];

export default defineConfig({
  ...baseConfig,
  tsconfig: 'tsconfig.build.json',
  entry: ['src/index.ts', 'src/platform/node.ts', 'src/platform/workerd.ts'],
  external,
});
