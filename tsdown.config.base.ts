import type { UserConfig } from 'tsdown';

// Turbo task execution triggers a tsdown tarball-pack path bug for scoped packages:
// an intermittent ENOENT while reading the packed `.tgz` (e.g. composio-anthropic-*.tgz).
// tsdown packs the tarball once and shares it between ATTW and publint, and only runs the
// pack when at least one of them is enabled — so BOTH must be disabled to skip the pack
// under Turbo. Keep both checks for direct package builds; disable them for workspace builds.
const isTurboTask = Boolean(process.env.TURBO_HASH);

export const baseNeverBundle: Array<string | RegExp> = ['zod', '@composio/core', /^node:/];

/**
 * tsdown config with shared defaults.
 * Package-specific options (e.g., entry, outDir, outExtensions) can be overridden by the caller.
 * Paths are relative to the closest `tsdown.config.ts` file that imports this config.
 */
export const baseConfig = {
  /**
   * Entry points for the build.
   */
  entry: ['src/index.ts'],

  /**
   * Output directory for the build.
   */
  outDir: 'dist',
  outExtensions: () => ({
    js: '.mjs',
    dts: '.d.mts',
  }),

  /**
   * Configures the output formats for the build.
   * - 'esm' generates ESM (ECMAScript Module) output
   */
  format: ['esm'],

  /**
   * Generates TypeScript declaration files (.d.mts, .d.ts)
   */
  dts: true,

  /**
   * Clean `outDir` before each build.
   */
  clean: true,

  /**
   * Compress code to reduce bundle size.
   */
  minify: false,

  /**
   * Target ECMAScript version for the output.
   */
  target: 'es2022',

  /**
   * Callback function to execute after a successful build.
   */
  onSuccess() {
    console.info('🙏 Build succeeded!');
  },

  deps: {
    /**
     * Dependencies that should not be bundled, but provided by the consumer.
     */
    neverBundle: baseNeverBundle,
    /**
     * Workspace packages intentionally bundle selected dependencies today. Keep
     * that behavior explicit without emitting per-package hint noise.
     */
    onlyBundle: false,
  },

  /**
   * Control how Node.js built-in module imports are handled.
   * When true, imports like `fs` are transformed to `node:fs`.
   */
  nodeProtocol: true,

  checks: {
    pluginTimings: false,
    ineffectiveDynamicImport: false,
  },

  /**
   * Configuration for @arethetypeswrong/cli.
   * Uses '.' entrypoint to check the package root via the exports field,
   * since src/index.ts is only used during development and not exported.
   * Uses the ESM-only profile because packages no longer publish CJS entrypoints.
   */
  attw: {
    entrypoints: ['.'],
    enabled: !isTurboTask,
    level: 'error',
    profile: 'esm-only',
    ignoreRules: [
      /* Node.js 10 only, attw doesn't automatically exclude it despite the selected profile */ 'internal-resolution-error',
    ],
  },

  /**
   * Configuration for publint.
   */
  publint: {
    enabled: !isTurboTask,
    level: 'error',
    pack: 'pnpm',
  },
} satisfies UserConfig;
