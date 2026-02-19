import { defineConfig, UserConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base';

export default defineConfig({
  ...baseConfig,
  tsconfig: 'tsconfig.build.json',
  copy: [{ from: 'pack/generated/*', to: '.', flatten: false }],
  entry: [
    'src/index.ts',

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
  ],
  attw: {
    ...baseConfig.attw,
    ignoreRules: [
      ...(baseConfig.attw?.ignoreRules ?? []),

      /**
       * We currently need `"type": "module"` in `@composio/core` package.json because:
       * - `@composio/cli` tests rely on it
       * - `@composio/cli` users rely on it
       * This causes issus with `attw`.
       *
       * Ideally, we can drop cjs support altogether in `@composio/core`.
       * Alternatively, we'd need to modify `composio ts generate` so that it generates .mjs files (and not .js).
       */
      'cjs-resolves-to-esm',
    ],
  },
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
