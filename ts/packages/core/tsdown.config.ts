import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base.ts';

export default defineConfig({
  ...baseConfig,
  tsconfig: 'tsconfig.build.json',
  copy: [
    { from: 'pack/generated/*', to: '.', flatten: false },
    { from: 'docs/**/*', to: 'dist/docs', flatten: false },
    {
      from: '../../../docs/content/reference/sdk-reference/typescript/*',
      to: 'dist/docs/reference/sdk-reference/typescript',
      flatten: true,
    },
  ],
  entry: [
    'src/index.ts',
    'src/experimental/index.ts',

    // #platform
    'src/platform/node.ts',
    'src/platform/workerd.ts',

    // #files
    'src/models/Files.node.ts',
    'src/models/Files.workerd.ts',

    // #file_tool_modifier
    'src/utils/modifiers/FileToolModifier.node.ts',
    'src/utils/modifiers/FileToolModifier.workerd.ts',

    // #config_defaults
    'src/utils/config-defaults/ConfigDefaults.node.ts',
    'src/utils/config-defaults/ConfigDefaults.workerd.ts',

    // public utility subpaths
    'src/utils/json-schema.ts',
  ],
  /**
   * We don't want to accidentally bundle `node:*` packages (e.g., `node:module`)
   * as not all of them are available in Cloudflare Workers / Vercel Edge runtimes.
   */
  external: [
    ...(baseConfig.external ?? []),
    '#platform',
    '#files',
    '#file_tool_modifier',
    '#config_defaults',
  ],
});
