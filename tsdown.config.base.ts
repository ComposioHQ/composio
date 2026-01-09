import type { UserConfig, OutExtensionContext } from 'tsdown';

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
  outExtensions: (ctx) => ({
    js: isESM(ctx)
      ? '.mjs'
      : '.js',
    dts: isESM(ctx)
      ? '.d.mts'
      : '.d.ts',
  }),

  /**
   * Configures the output formats for the build.
   * - 'esm' generates ESM (ECMAScript Module) output
   * - 'cjs' generates CommonJS output
   */
  format: ['esm', 'cjs'],

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

  /**
   * External dependencies that should not be bundled, but provided by the consumer.
   */
  external: ['zod'],

  /**
   * Control how Node.js built-in module imports are handled.
   * When true, imports like `fs` are transformed to `node:fs`.
   */
  nodeProtocol: true,
} satisfies UserConfig

function isESM(ctx: OutExtensionContext) {
  return ctx.format === 'es'
}
